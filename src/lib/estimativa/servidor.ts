// Estimativa do resultado final (lado servidor, sem dependência de Next).
// Junta: totais ao vivo por UF (getEstados) + progresso por município ({uf}-ab.json) +
// histórico 2018/2022 por município (public/data/hist, lido do disco) → modelo (./modelo).
//
// Os JSONs de public/data/hist são incluídos no bundle da função /api/estimativa via
// `outputFileTracingIncludes` em next.config.ts (leitura com fs + process.cwd()).
import { promises as fs } from "node:fs";
import path from "node:path";
import { UFS } from "../config";
import { mapLimit } from "../tse/fetch";
import { getAcompanhamentoUF, getEstados, type AcompanhamentoUF } from "../tse/service";
import type { Ambiente, EstadosResponse, EstimativaResponse, HistBrFile, HistMunFile, LiveResult, Turno } from "../types";
import { margemPara } from "./margens";
import { estimar, type EntradaUF } from "./modelo";

/** Cache-Control da rota com estimativa calculada. */
export const CACHE_ESTIMATIVA = "public, s-maxage=20, stale-while-revalidate=60";
/** Antes do início da apuração: cache curto, para a estimativa aparecer logo que o TSE começar a divulgar. */
export const CACHE_ESTIMATIVA_INDISPONIVEL = "public, s-maxage=10, stale-while-revalidate=10";

export const MSG_ESTIMATIVA_INDISPONIVEL =
  "Ainda não há seções totalizadas pelo TSE. A estimativa aparece assim que a apuração começar (divulgação a partir das 17h, horário de Brasília).";

/** Downloads simultâneos de acompanhamento por UF (além do limitador global de fetchTse). */
const CONCORRENCIA_PROGRESSO = 8;

// ---------------------------------------------------------------------------
// Histórico (estático) — lido do disco uma vez por instância
// ---------------------------------------------------------------------------

const DIR_HIST = path.join(process.cwd(), "public", "data", "hist");

let histBrP: Promise<HistBrFile> | null = null;
const histMunP = new Map<string, Promise<HistMunFile>>();

async function lerJson<T>(arquivo: string): Promise<T> {
  return JSON.parse(await fs.readFile(arquivo, "utf8")) as T;
}

/** public/data/hist/br.json (cache em memória; falhas não ficam no cache). */
export function getHistBr(): Promise<HistBrFile> {
  if (!histBrP) {
    const p = lerJson<HistBrFile>(path.join(DIR_HIST, "br.json"));
    histBrP = p;
    p.catch(() => {
      if (histBrP === p) histBrP = null;
    });
  }
  return histBrP;
}

/** public/data/hist/mun/{uf}.json (cache em memória; falhas não ficam no cache). */
export function getHistMun(uf: string): Promise<HistMunFile> {
  const u = uf.toLowerCase();
  if (!/^[a-z]{2}$/.test(u)) return Promise.reject(new Error(`UF inválida: ${uf}`));
  let p = histMunP.get(u);
  if (!p) {
    p = lerJson<HistMunFile>(path.join(DIR_HIST, "mun", `${u}.json`));
    const pp = p;
    histMunP.set(u, pp);
    pp.catch(() => {
      if (histMunP.get(u) === pp) histMunP.delete(u);
    });
  }
  return p;
}

// ---------------------------------------------------------------------------
// Progresso por município
// ---------------------------------------------------------------------------

/**
 * Fonte do progresso por município (padrão: getAcompanhamentoUF; injetável em testes).
 * Pode devolver só as frações (código TSE → 0..1) ou {fracoes, secoes}; com `secoes` (ts por
 * município) as frações são conciliadas com as seções totalizadas do resultado da UF.
 */
export type ProvedorProgresso = (p: {
  uf: string;
  turno: Turno;
  ambiente: Ambiente;
}) => Promise<Record<string, number> | AcompanhamentoUF | null>;

function ehDetalhado(p: Record<string, number> | AcompanhamentoUF): p is AcompanhamentoUF {
  const x = p as Partial<AcompanhamentoUF>;
  return typeof x.fracoes === "object" && x.fracoes !== null && typeof x.secoes === "object" && x.secoes !== null;
}

/** Todos os municípios com histórico recebem a mesma fração `f`. */
function progressoUniforme(hist: HistMunFile, f: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cd of Object.keys(hist)) out[cd] = f;
  return out;
}

/**
 * Concilia as frações do acompanhamento com as seções totalizadas do RESULTADO da UF
 * (`stAlvo`, de onde vêm V/P/B). Os dois arquivos do TSE passam pelo CDN separadamente e podem
 * estar defasados (dezenas de segundos; no início da apuração isso são vários p.p. de seções).
 * Sem conciliar, a parte "apurada" medida no ano-base (Bc) não corresponde a V: com o -ab.json
 * atrasado, crescimento = V/Bc.vv sai inflado e o restante (Vr) idem — no teste sintético, 15% de
 * defasagem → +17% nos válidos estimados do Brasil (5% → +5%).
 *  - acompanhamento ATRÁS do resultado: as seções que faltam são distribuídas entre os municípios
 *    proporcionalmente às seções ainda pendentes em cada um (f' = f + α·(1 − f); "toda seção
 *    pendente tem a mesma chance de ter sido totalizada nesse intervalo"). Entre as variantes
 *    testadas (escala γ·f, Δf constante), é a de menor erro no pior caso;
 *  - acompanhamento À FRENTE: todas as frações são reduzidas na mesma proporção (f' = β·f).
 * Garante Σ f'·ts = stAlvo. Sem nenhuma seção no acompanhamento, vira o progresso uniforme.
 */
export function conciliarProgresso(
  fracoes: Record<string, number>,
  secoes: Record<string, number>,
  stAlvo: number,
): { fracoes: Record<string, number>; defasagem: number } {
  let T = 0;
  let S = 0;
  for (const cd in secoes) {
    const ts = secoes[cd];
    if (!(ts > 0)) continue;
    T += ts;
    S += Math.max(0, Math.min(1, fracoes[cd] ?? 0)) * ts;
  }
  if (T <= 0) return { fracoes, defasagem: 0 };
  const alvo = Math.max(0, Math.min(T, stAlvo));
  const defasagem = (alvo - S) / T; // > 0: acompanhamento atrasado
  if (Math.abs(alvo - S) < 0.5) return { fracoes, defasagem };
  const out: Record<string, number> = { ...fracoes };
  if (alvo > S) {
    const a = Math.min(1, (alvo - S) / (T - S));
    for (const cd in secoes) {
      if (!(secoes[cd] > 0)) continue;
      const f = Math.max(0, Math.min(1, fracoes[cd] ?? 0));
      out[cd] = f + a * (1 - f);
    }
  } else {
    const b = S > 0 ? alvo / S : 0;
    for (const cd in out) out[cd] = Math.max(0, Math.min(1, out[cd] ?? 0)) * b;
  }
  return { fracoes: out, defasagem };
}

/**
 * Fração totalizada por município (código TSE → 0..1).
 *  - nada totalizado na UF → {} (sem download);
 *  - UF 100% totalizada → todos = 1 (sem download);
 *  - senão {uf}-ab.json do TSE, conciliado com as seções do resultado da UF (conciliarProgresso).
 *    Se ele falhar ou não tiver nenhuma seção enquanto o resultado da UF já tem (404 / CDN
 *    atrasado), usa a aproximação UNIFORME (todos os municípios com a fração da UF): sem isso o
 *    modelo trataria a UF inteira como "restante" e contaria em dobro os votos já apurados.
 */
async function progressoDaUF(
  uf: string,
  live: LiveResult | null,
  hist: HistMunFile,
  turno: Turno,
  ambiente: Ambiente,
  baixar: ProvedorProgresso,
): Promise<Record<string, number>> {
  const t = live?.totais;
  if (!t || t.secoesTotalizadas <= 0) return {};
  if (t.secoesTotal > 0 && t.secoesTotalizadas >= t.secoesTotal) return progressoUniforme(hist, 1);
  try {
    const p = await baixar({ uf, turno, ambiente });
    if (p && ehDetalhado(p)) {
      if (Object.values(p.fracoes).some((f) => f > 0)) {
        const c = conciliarProgresso(p.fracoes, p.secoes, t.secoesTotalizadas);
        if (Math.abs(c.defasagem) >= 0.02)
          console.warn(`[estimativa] ${uf}: acompanhamento defasado ${(c.defasagem * 100).toFixed(1)} p.p. de seções em relação ao resultado; conciliado`);
        return c.fracoes;
      }
    } else if (p && Object.values(p).some((f) => f > 0)) {
      return p;
    }
    console.warn(`[estimativa] ${uf}: acompanhamento ${p ? "sem seções totalizadas" : "não publicado"}; usando progresso uniforme`);
  } catch (e) {
    console.warn(`[estimativa] ${uf}: falha no acompanhamento (${e instanceof Error ? e.message : e}); usando progresso uniforme`);
  }
  const f = t.secoesTotal > 0 ? t.secoesTotalizadas / t.secoesTotal : t.pctTotalizado / 100;
  return progressoUniforme(hist, Math.max(0, Math.min(1, f)));
}

// ---------------------------------------------------------------------------
// Estimativa
// ---------------------------------------------------------------------------

function temApuracao(r: LiveResult | null | undefined): boolean {
  return !!r && r.totais.secoesTotalizadas > 0 && r.totais.validos > 0;
}

/** ISO mais recente entre os resultados (compara pelo instante, não pela string). */
function maisRecente(rs: (LiveResult | null | undefined)[]): string | null {
  let melhor: string | null = null;
  let tMelhor = -Infinity;
  for (const r of rs) {
    const iso = r?.atualizadoEm;
    if (!iso) continue;
    const t = Date.parse(iso);
    if (isFinite(t) && t > tMelhor) {
      tMelhor = t;
      melhor = iso;
    }
  }
  return melhor;
}

async function calcular(p: { turno: Turno; ambiente: Ambiente }): Promise<EstimativaResponse> {
  // getEstados lança (→ 502) só quando o nacional E a maioria das UFs falham por erro
  return estimativaDeEstados(await getEstados(p));
}

/**
 * Estimativa a partir de um EstadosResponse já obtido (exportada para testes/backtest:
 * permite injetar totais parciais e o provedor de progresso).
 */
export async function estimativaDeEstados(
  estados: EstadosResponse,
  deps: { progresso?: ProvedorProgresso } = {},
): Promise<EstimativaResponse> {
  const { turno, ambiente } = estados;
  const baixar = deps.progresso ?? getAcompanhamentoUF;
  const vivos = [estados.br, ...Object.values(estados.ufs)];
  const atualizadoEm = maisRecente(vivos);

  if (!vivos.some(temApuracao)) {
    return {
      turno,
      ambiente,
      geradoEm: new Date().toISOString(),
      atualizadoEm,
      disponivel: false,
      motivo: MSG_ESTIMATIVA_INDISPONIVEL,
      br: null,
      ufs: {},
      intervalo: null,
      margemHistorica: null,
    };
  }

  const siglas = UFS.map((u) => u.sigla); // 27 UFs + "zz"
  const pHistBr = getHistBr();
  const entradas = await mapLimit(siglas, CONCORRENCIA_PROGRESSO, async (uf): Promise<EntradaUF> => {
    const live = estados.ufs[uf] ?? null;
    const [hist, hb] = await Promise.all([getHistMun(uf), pHistBr]);
    const progresso = await progressoDaUF(uf, live, hist, turno, ambiente, baixar);
    return {
      uf,
      live: live
        ? {
            vv: live.totais.validos,
            pt: live.blocos.pt?.votos ?? 0,
            bo: live.blocos.bolso?.votos ?? 0,
            pctTotalizado: live.totais.pctTotalizado,
          }
        : null,
      progresso,
      hist,
      histUf: hb.ufs[uf],
      eleitorado: live?.totais.eleitorado || undefined,
    };
  });
  const histBr = await pHistBr;

  const r = estimar(entradas, turno, {
    histBr: histBr.br,
    margemHistorica: margemPara,
    // % oficial do TSE (por seções) para o Brasil, quando o nacional estiver disponível
    pctTotalizadoBr: estados.br ? estados.br.totais.pctTotalizado : undefined,
    // A faixa usa base 2022 + proporcional. O cenário base 2018 (Haddad) continua exibido, mas
    // fica de fora da faixa: no começo da noite ele a alargava para ~39–61%, sem utilidade.
    // A cobertura da faixa no backtest foi medida exatamente com estes dois cenários + margem.
    cenariosIntervalo: ["base2022", "proporcional"],
  });
  const resp: EstimativaResponse = {
    turno,
    ambiente,
    geradoEm: new Date().toISOString(),
    atualizadoEm,
    disponivel: r.disponivel,
    br: r.br,
    ufs: r.ufs,
    intervalo: r.intervalo,
    margemHistorica: r.margemHistorica,
  };
  if (r.motivo) resp.motivo = r.motivo;
  return resp;
}

/** Memo curto + deduplicação de cálculos em voo (por ambiente/turno). */
const MEMO_MS = 5_000;
const memo = new Map<string, { exp: number; p: Promise<EstimativaResponse> }>();

/**
 * Estimativa do resultado final (Brasil + UFs + exterior) a partir da apuração parcial.
 * Antes do início da apuração devolve rapidamente `disponivel: false` (br null, ufs {}).
 * Lança TseFetchError (→ 502) quando o TSE está indisponível.
 */
export function getEstimativa(p: { turno: Turno; ambiente: Ambiente }): Promise<EstimativaResponse> {
  const key = `${p.ambiente}:${p.turno}`;
  const c = memo.get(key);
  if (c && c.exp > Date.now()) return c.p;
  const prom = calcular(p);
  const entrada = { exp: Infinity, p: prom }; // em voo: deduplica; ao terminar, vale MEMO_MS
  memo.set(key, entrada);
  prom.then(
    () => {
      entrada.exp = Date.now() + MEMO_MS;
    },
    () => {
      if (memo.get(key) === entrada) memo.delete(key);
    },
  );
  return prom;
}
