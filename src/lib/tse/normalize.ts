// Normalização dos JSONs do TSE para os contratos LiveResult / LiveMunRow.
// Funções puras (sem I/O, sem Next).
import type { Ambiente, BlocoId, LiveCandidate, LiveMunRow, LiveResult, LiveTotals, Turno } from "../types";
import { BLOCOS } from "../config";
import { dataHoraBrasilia, dec, int, round } from "./parse";
import type { RawCandidato, RawUnificado } from "./raw";

export interface NormalizeCtx {
  escopo: LiveResult["escopo"];
  /** "br" ou sigla minúscula */
  uf: string;
  mun?: string;
  turno: Turno;
  ambiente: Ambiente;
  /** código da eleição (ex. "6257"); se ausente, usa o campo `ele` do arquivo */
  eleicao?: string;
}

/** Números de urna escolhidos para cada bloco (usado no fallback do simulado). */
export type MapeamentoBlocos = Partial<Record<BlocoId, string>>;

const RE_PT = /\bLULA\b/i;
const RE_BOLSO = /FL[AÁ]VIO|BOLSONARO/i;
/** Nome completo do Flávio (preferido quando mais de um candidato casar com RE_BOLSO, ex.: outro "Bolsonaro"). */
const RE_FLAVIO_BOLSONARO = /FL[AÁ]VIO\b.*\bBOLSONARO/i;

/** Destinação "Válido" (ou ainda não informada, como nos placeholders antes da apuração). */
export function destinacaoValida(dvt: string | undefined | null): boolean {
  const d = (dvt ?? "").trim();
  return d === "" || /^v[aá]lido/i.test(d);
}

/**
 * Totalização finalizada?
 * Campos observados nos arquivos 2026:
 *   - `and` (andamento): "n" = não iniciada (arquivos oficiais antes das 17h), "f" = finalizada
 *     (simulado completo); valores intermediários = em andamento.
 *   - `tf`: "n" antes do início, "s" no simulado finalizado (provável "totalização final").
 *   - `dv`: "s" em todos os arquivos vistos (inclusive antes do início) → não indica fim; ignorado.
 * Regra: usa `and === "f"`; só quando `and` estiver ausente cai para `tf === "s"`.
 */
export function isFinalizado(j: Pick<RawUnificado, "and" | "tf">): boolean {
  if (typeof j.and === "string" && j.and !== "") return j.and.toLowerCase() === "f";
  return (j.tf ?? "").toLowerCase() === "s";
}

/**
 * Totalização ainda não iniciada para a abrangência (o TSE publica, antes das 17h,
 * arquivos "placeholder" com tudo zerado, `and = "n"` e `dt = ""`).
 */
export function isNaoIniciado(j: Pick<RawUnificado, "and" | "s">): boolean {
  if (isFinalizado(j as RawUnificado)) return false;
  return int(j.s?.st) === 0;
}

/** Achata carg[0].agr[].par[].cand[] (cargo Presidente). */
function candidatosBrutos(j: RawUnificado): { c: RawCandidato; partido: string }[] {
  const out: { c: RawCandidato; partido: string }[] = [];
  const cargo = j.carg?.find((c) => c.cd === "1") ?? j.carg?.[0];
  for (const agr of cargo?.agr ?? []) {
    for (const par of agr.par ?? []) {
      for (const c of par.cand ?? []) out.push({ c, partido: par.sg ?? "" });
    }
  }
  return out;
}

function pctOuNull(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = dec(v);
    if (n != null) return n;
  }
  return null;
}

/**
 * Decide se o candidato foi eleito. No arquivo do TSE `e = "s"` também marca quem foi
 * classificado para o 2º turno (st = "2º turno"); por isso, quando `st` existe, ele manda.
 */
function eleito(c: RawCandidato): boolean {
  const st = (c.st ?? "").trim();
  if (st) return /^eleit/i.test(st);
  return (c.e ?? "").toLowerCase() === "s";
}

/** Mapeia os blocos por nome (nmu/nm) e, se preciso, pelo número de urna (13 / 22). */
export function mapearBlocosPorNomeNumero(cands: LiveCandidate[], nomes?: Map<string, string>): Partial<Record<BlocoId, LiveCandidate>> {
  const blocos: Partial<Record<BlocoId, LiveCandidate>> = {};
  const nomeDe = (c: LiveCandidate) => `${c.nome} ${nomes?.get(c.n) ?? ""}`;
  const usados = new Set<string>();

  const escolher = (re: RegExp, numero: string, excluirRe?: RegExp, preferirRe?: RegExp): LiveCandidate | undefined => {
    let porNome = cands.filter((c) => !usados.has(c.n) && re.test(nomeDe(c)));
    if (excluirRe && porNome.length > 1) {
      const semConflito = porNome.filter((c) => !excluirRe.test(nomeDe(c)));
      if (semConflito.length) porNome = semConflito;
    }
    if (preferirRe && porNome.length > 1) {
      const preferidos = porNome.filter((c) => preferirRe.test(nomeDe(c)));
      if (preferidos.length) porNome = preferidos;
    }
    if (porNome.length === 1) return porNome[0];
    if (porNome.length > 1) return porNome.find((c) => c.n === numero) ?? porNome[0];
    return cands.find((c) => !usados.has(c.n) && c.n === numero);
  };

  const pt = escolher(RE_PT, BLOCOS.pt.numeros["2026"], RE_BOLSO);
  if (pt) {
    blocos.pt = pt;
    usados.add(pt.n);
  }
  const bo = escolher(RE_BOLSO, BLOCOS.bolso.numeros["2026"], RE_PT, RE_FLAVIO_BOLSONARO);
  if (bo) {
    blocos.bolso = bo;
    usados.add(bo.n);
  }
  return blocos;
}

/**
 * Mapeamento "nacional" para o fallback: blocos achados por nome/número e, para os que faltarem,
 * os mais votados ainda não usados (1º → pt, 2º → bolso). Prefere candidatos com destinação
 * "Válido": os votos de candidatos anulados não entram em `totais.validos`, então o % deles
 * não seria comparável com 2022/2018 (o simulado tem um "Anulado sub judice" em 1º lugar).
 */
export function mapeamentoParaFallback(r: LiveResult): { mapa: MapeamentoBlocos; fallback: boolean } {
  const mapa: MapeamentoBlocos = {};
  let fallback = false;
  for (const b of ["pt", "bolso"] as BlocoId[]) if (r.blocos[b]) mapa[b] = r.blocos[b]!.n;
  const usados = new Set(Object.values(mapa));
  const livres = r.candidatos.filter((c) => !usados.has(c.n));
  const ranking = [...livres.filter((c) => destinacaoValida(c.destinacao)), ...livres.filter((c) => !destinacaoValida(c.destinacao))];
  let i = 0;
  for (const b of ["pt", "bolso"] as BlocoId[]) {
    if (!mapa[b] && ranking[i]) {
      mapa[b] = ranking[i++].n;
      fallback = true;
    }
  }
  return { mapa, fallback };
}

/** Preenche (no próprio objeto) os blocos que faltam usando os números do mapeamento nacional. */
export function aplicarFallbackBlocos(r: LiveResult, mapa: MapeamentoBlocos): LiveResult {
  for (const b of ["pt", "bolso"] as BlocoId[]) {
    if (r.blocos[b] || !mapa[b]) continue;
    const c = r.candidatos.find((x) => x.n === mapa[b]);
    if (c && !Object.values(r.blocos).some((o) => o?.n === c.n)) {
      r.blocos[b] = c;
      r.blocosPorFallback = true;
    }
  }
  return r;
}

/** Blocos que ainda faltam no resultado. */
export function blocosFaltando(r: LiveResult): BlocoId[] {
  return (["pt", "bolso"] as BlocoId[]).filter((b) => !r.blocos[b]);
}

/**
 * JSON "unificado" do TSE ({uf}{mun?}-c0001-e{ele6}-u.json) → LiveResult.
 * Mapeia os blocos só por nome/número; o fallback do simulado é aplicado em `service.ts`.
 *
 * Percentuais: `pct` = votos / `v.vv` × 100 (votos válidos = soma dos votos nominais dos
 * candidatos com destinação "Válido"), a MESMA definição usada em 2022/2018 (hist: bloco / vv) e
 * em `LiveMunRow` (pt / vv). NÃO usamos o `pvapn` do TSE como valor principal: verificado no
 * simulado, ele é calculado sobre a soma dos votos de TODOS os candidatos (incl. "Anulado" e
 * "Anulado sub judice"), logo diverge de votos/vv sempre que houver candidato anulado
 * (ex.: 9130869 / 100982116 = 9,04% vs pvapn 7,57%). `pvapn`/`pvap` só entram quando vv = 0.
 * Para candidatos anulados o % também é relativo a vv (eles não somam no denominador).
 * `pctTotalizado` usa `s.pstn` e `pctComparecimento` usa `e.pcn`
 * (comparecimento sobre o eleitorado das seções totalizadas).
 */
export function normalizeUnificado(j: RawUnificado, ctx: NormalizeCtx): LiveResult {
  const s = j.s ?? {};
  const e = j.e ?? {};
  const v = j.v ?? {};

  const validos = int(v.vv);
  const nomesCompletos = new Map<string, string>();

  const candidatos: (LiveCandidate & { _seq: number })[] = candidatosBrutos(j).map(({ c, partido }) => {
    const votos = int(c.vap);
    const n = c.n ?? "";
    const pct = validos > 0 ? (votos / validos) * 100 : (pctOuNull(c.pvapn, c.pvap) ?? 0);
    if (c.nm) nomesCompletos.set(n, c.nm);
    const cand: LiveCandidate & { _seq: number } = {
      n,
      nome: (c.nmu || c.nm || `Candidato ${n}`).trim(),
      partido,
      votos,
      pct: round(pct, 6),
      _seq: int(c.seq),
    };
    const st = (c.st ?? "").trim();
    if (st) cand.situacao = st;
    cand.eleito = eleito(c);
    if (c.dvt) cand.destinacao = c.dvt;
    return cand;
  });

  candidatos.sort((a, b) => b.votos - a.votos || a._seq - b._seq || a.n.localeCompare(b.n));
  const limpos: LiveCandidate[] = candidatos.map((c) => {
    const { _seq: _ignorado, ...resto } = c; // eslint-disable-line @typescript-eslint/no-unused-vars
    return resto;
  });

  const ts = int(s.ts);
  const st = int(s.st);
  const te = int(e.te);
  const est = int(e.est);
  const comp = int(e.c);
  const abst = int(e.a);

  const pctTot = pctOuNull(s.pstn, s.pst) ?? (ts > 0 ? (st / ts) * 100 : 0);
  const baseComp = est > 0 ? est : comp + abst;
  const pctComp = pctOuNull(e.pcn, e.pc) ?? (baseComp > 0 ? (comp / baseComp) * 100 : 0);

  const totais: LiveTotals = {
    secoesTotal: ts,
    secoesTotalizadas: st,
    pctTotalizado: round(pctTot, 4),
    eleitorado: te,
    comparecimento: comp,
    abstencao: abst,
    pctComparecimento: round(pctComp, 4),
    validos,
    brancos: int(v.vb),
    nulos: int(v.tvn ?? v.vn),
  };

  const atualizadoEm = dataHoraBrasilia(j.dt, j.ht) ?? dataHoraBrasilia(j.dg, j.hg);

  const r: LiveResult = {
    escopo: ctx.escopo,
    uf: ctx.escopo === "br" ? "br" : ctx.uf.toLowerCase(),
    turno: ctx.turno,
    ambiente: ctx.ambiente,
    eleicao: ctx.eleicao ?? j.ele ?? "",
    atualizadoEm,
    finalizado: isFinalizado(j),
    totais,
    candidatos: limpos,
    blocos: mapearBlocosPorNomeNumero(limpos, nomesCompletos),
  };
  if (ctx.escopo === "mun" && ctx.mun) r.mun = ctx.mun;
  return r;
}

/** LiveResult → linha compacta de município. */
export function toMunRow(r: LiveResult): LiveMunRow {
  const row: LiveMunRow = {
    pa: r.totais.pctTotalizado,
    vv: r.totais.validos,
    pt: r.blocos.pt?.votos ?? 0,
    bo: r.blocos.bolso?.votos ?? 0,
    comp: r.totais.comparecimento,
    ap: r.totais.eleitorado,
  };
  const lider = r.candidatos[0];
  if (lider && lider.votos > 0) row.lid = lider.n;
  return row;
}

/** Linha "zerada" (município sem seções totalizadas ainda). */
export function munRowVazia(eleitorado = 0, comparecimento = 0): LiveMunRow {
  return { pa: 0, vv: 0, pt: 0, bo: 0, comp: comparecimento, ap: eleitorado };
}
