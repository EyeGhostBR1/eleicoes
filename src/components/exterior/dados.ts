// Helpers puros (sem hooks) dos boletins de urna do exterior: soma de históricos por
// conjunto de cidades, linhas por país/cidade e a "comparação justa" (mesmas cidades).
//
// Por que "mesmas cidades": os boletins chegam por fuso horário (Ásia/Oceania primeiro,
// Américas por último). Comparar o total parcial de 2026 com o exterior inteiro de 2022
// mistura geografias diferentes; aqui 2022/2018 são somados só nas cidades que já têm
// boletins em 2026.
import { BLOCOS } from "@/lib/config";
import { comparar, histDe, pct, type LinhaComparacao } from "@/lib/compare";
import { cidadesDoPais, histPorPais, listaPaises, paisDaCidade } from "@/lib/exterior/paises";
import type {
  BlocoId,
  ExtAgregado,
  ExtCidade,
  ExteriorResponse,
  HistByYear,
  HistMunFile,
  HistResult,
  Turno,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Básicos
// ---------------------------------------------------------------------------

/** Emoji da bandeira a partir do ISO 3166-1 alfa-2 ("JP" → 🇯🇵). Sem código válido → 🌐. */
export function bandeira(iso2: string | null | undefined): string {
  if (!iso2 || !/^[a-z]{2}$/i.test(iso2)) return "🌐";
  const base = 0x1f1e6;
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65));
}

/** Bloco de um número de candidato em 2026 (13 = Lula, 22 = Flávio). */
export function blocoDoNumero(n: string): BlocoId | null {
  if (n === BLOCOS.pt.numeros["2026"]) return "pt";
  if (n === BLOCOS.bolso.numeros["2026"]) return "bolso";
  return null;
}

export type Candidatos = ExteriorResponse["candidatos"];

export function nomeCandidato(n: string, candidatos: Candidatos | undefined): string {
  const c = candidatos?.[n];
  if (c?.nome) return c.nome;
  const b = blocoDoNumero(n);
  return b ? BLOCOS[b].nomes["2026"] : `nº ${n}`;
}

export function agregadoVazio(): ExtAgregado {
  return {
    secoesTotal: 0,
    secoesRecebidas: 0,
    aptos: 0,
    comparecimento: 0,
    validos: 0,
    brancos: 0,
    nulos: 0,
    votos: {},
    pt: 0,
    bo: 0,
  };
}

/** Soma agregados (inclusive os votos por candidato). */
export function somaAgregados(lista: Iterable<ExtAgregado>): ExtAgregado {
  const out = agregadoVazio();
  for (const a of lista) {
    out.secoesTotal += a.secoesTotal || 0;
    out.secoesRecebidas += a.secoesRecebidas || 0;
    out.aptos += a.aptos || 0;
    out.comparecimento += a.comparecimento || 0;
    out.validos += a.validos || 0;
    out.brancos += a.brancos || 0;
    out.nulos += a.nulos || 0;
    out.pt += a.pt || 0;
    out.bo += a.bo || 0;
    for (const [n, v] of Object.entries(a.votos ?? {})) out.votos[n] = (out.votos[n] ?? 0) + (v || 0);
  }
  return out;
}

function somarHist(a: HistResult | undefined, b: HistResult, peso: number): HistResult {
  const z = a ?? { ap: 0, comp: 0, abst: 0, vv: 0, vb: 0, vn: 0, pt: 0, bo: 0 };
  return {
    ap: z.ap + b.ap * peso,
    comp: z.comp + b.comp * peso,
    abst: z.abst + b.abst * peso,
    vv: z.vv + b.vv * peso,
    vb: z.vb + b.vb * peso,
    vn: z.vn + b.vn * peso,
    pt: z.pt + b.pt * peso,
    bo: z.bo + b.bo * peso,
  };
}

/**
 * Soma o histórico (2018/2022, ambos os turnos) de um conjunto de cidades do exterior.
 * Cada item pode ser só o código (peso 1) ou [código, peso] — o peso pondera cidades com
 * recebimento parcial (seções recebidas ÷ total), para que 2022/2018 tenham o mesmo peso
 * relativo que a cidade tem no parcial de 2026. Com pesos fracionários os "votos" somados
 * deixam de ser inteiros; use-os só para percentuais.
 */
export function somaHist(
  itens: Iterable<string | readonly [string, number]>,
  histZz: HistMunFile | null | undefined,
): HistByYear {
  const out: HistByYear = {};
  if (!histZz) return out;
  for (const it of itens) {
    const [cd, peso] = typeof it === "string" ? [it, 1] : it;
    const h = histZz[cd];
    if (!h || !(peso > 0)) continue;
    for (const ano of ["2018", "2022"] as const) {
      for (const t of ["1", "2"] as const) {
        const r = h[ano]?.[t];
        if (!r) continue;
        const porAno = (out[ano] ??= {});
        porAno[t] = somarHist(porAno[t], r, peso);
      }
    }
  }
  return out;
}

/** Lula/Flávio no 1º turno de 2026 (% dos válidos) — referência na página do 2º turno. */
export interface RefT1Ext {
  pt: number | null;
  bo: number | null;
  /** comparecimento (% dos aptos) */
  comp: number | null;
}

/**
 * 1º turno de 2026 (boletins de urna) somado nas cidades dadas, cada uma com um peso (fração das
 * seções já recebidas no 2º turno, como em 2022/2018). Só percentuais; null sem votos.
 */
export function t1Ponderado(
  itens: Iterable<readonly [string, number]>,
  ext1: ExteriorResponse | null | undefined,
): RefT1Ext | null {
  if (!ext1) return null;
  let vv = 0;
  let pt = 0;
  let bo = 0;
  let comp = 0;
  let ap = 0;
  for (const [cd, w] of itens) {
    const c = ext1.cidades?.[cd];
    if (!c || !(w > 0) || !(c.validos > 0)) continue;
    vv += c.validos * w;
    pt += c.pt * w;
    bo += c.bo * w;
    comp += c.comparecimento * w;
    ap += c.aptos * w;
  }
  return vv > 0 ? { pt: pct(pt, vv), bo: pct(bo, vv), comp: pct(comp, ap) } : null;
}

/** Peso de uma cidade no parcial de 2026: fração das seções já recebidas (0–1). */
export function pesoRecebido(c: Pick<ExtAgregado, "secoesTotal" | "secoesRecebidas"> | null | undefined): number {
  if (!c || !(c.secoesRecebidas > 0)) return 0;
  if (!(c.secoesTotal > 0)) return 1;
  return Math.min(1, c.secoesRecebidas / c.secoesTotal);
}

/** true quando a cidade tem histórico de 2022 e 2018 no turno. */
export function temHistCompleto(histZz: HistMunFile | null | undefined, cd: string, turno: Turno): boolean {
  const h = histZz?.[cd];
  return !!histDe(h, "2022", turno) && !!histDe(h, "2018", turno);
}

export interface LiderExt {
  n: string;
  nome: string;
  bloco: BlocoId | null;
  /** % dos válidos */
  pct: number | null;
}

/** Candidato mais votado num agregado (null se não há votos ou há empate no topo). */
export function liderDe(ag: ExtAgregado | null | undefined, candidatos: Candidatos | undefined): LiderExt | null {
  if (!ag || !(ag.validos > 0)) return null;
  const ord = Object.entries(ag.votos ?? {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!ord.length) return null;
  if (ord.length > 1 && ord[0][1] === ord[1][1]) return null;
  const [n, v] = ord[0];
  return { n, nome: nomeCandidato(n, candidatos), bloco: blocoDoNumero(n), pct: pct(v, ag.validos) };
}

/** % de seções recebidas (0–100) ou null quando o total é desconhecido. */
export function pctRecebido(ag: Pick<ExtAgregado, "secoesTotal" | "secoesRecebidas"> | null | undefined): number | null {
  if (!ag || !(ag.secoesTotal > 0)) return null;
  return Math.min(100, (ag.secoesRecebidas / ag.secoesTotal) * 100);
}

function temVotos(ag: ExtAgregado | null | undefined): ag is ExtAgregado {
  return !!ag && ag.secoesRecebidas > 0 && ag.validos > 0;
}

// ---------------------------------------------------------------------------
// Linhas (país / cidade)
// ---------------------------------------------------------------------------

export interface LinhaExt {
  id: string;
  tipo: "pais" | "cidade";
  nome: string;
  iso2?: string;
  /** link da linha (cidade → /cidade/zz/{cd}) */
  href?: string;
  secoesTotal: number | null;
  secoesRecebidas: number;
  pa: number | null;
  /** votos válidos recebidos em 2026 */
  validos: number | null;
  ag: ExtAgregado | null;
  pt: LinhaComparacao;
  bo: LinhaComparacao;
  lider: LiderExt | null;
  /** códigos das cidades (linhas de país) */
  cidades?: string[];
  /**
   * país com recebimento parcial: base 2022/2018 restrita às `n` (de `de`) cidades com boletins,
   * ponderadas pela fração de seções recebidas
   */
  baseParcial?: { n: number; de: number } | null;
  /** sem histórico de 2022/2018 (cidade nova) */
  semHist?: boolean;
  /** 1º turno de 2026 na mesma base (só na página do 2º turno) */
  t1?: RefT1Ext | null;
}

export function linhaDe(p: {
  id: string;
  tipo: "pais" | "cidade";
  nome: string;
  iso2?: string;
  href?: string;
  ag: ExtAgregado | null | undefined;
  hist: HistByYear | null | undefined;
  turno: Turno;
  candidatos: Candidatos | undefined;
  cidades?: string[];
  baseParcial?: { n: number; de: number } | null;
}): LinhaExt {
  const ag = p.ag ?? null;
  const com = temVotos(ag);
  const pt = comparar("pt", { pct: com ? pct(ag.pt, ag.validos) : null, votos: com ? ag.pt : null }, p.hist, p.turno);
  const bo = comparar("bolso", { pct: com ? pct(ag.bo, ag.validos) : null, votos: com ? ag.bo : null }, p.hist, p.turno);
  return {
    id: p.id,
    tipo: p.tipo,
    nome: p.nome,
    iso2: p.iso2,
    href: p.href,
    secoesTotal: ag && ag.secoesTotal > 0 ? ag.secoesTotal : null,
    secoesRecebidas: ag?.secoesRecebidas ?? 0,
    pa: pctRecebido(ag),
    validos: com ? ag.validos : null,
    ag,
    pt,
    bo,
    lider: liderDe(ag, p.candidatos),
    cidades: p.cidades,
    baseParcial: p.baseParcial ?? null,
    semHist: !histDe(p.hist, "2022", p.turno) && !histDe(p.hist, "2018", p.turno),
  };
}

export type BaseHist = "mesmas" | "pais";

function iso2DoPais(pais: string, ext: ExteriorResponse | undefined, cds: string[]): string | undefined {
  const e = ext?.paises?.[pais]?.iso2;
  if (e) return e;
  for (const cd of cds) {
    const i = paisDaCidade(cd)?.iso2;
    if (i) return i;
  }
  return undefined;
}

/** Cidades de um país: as da resposta da API, senão as do mapeamento local. */
export function cidadesDe(pais: string, ext: ExteriorResponse | undefined): string[] {
  const c = ext?.paises?.[pais]?.cidades;
  return c && c.length ? c : cidadesDoPais(pais);
}

/** Uma linha por país (inclui países ainda sem boletins). */
export function linhasPaises(
  ext: ExteriorResponse | undefined,
  histZz: HistMunFile | null | undefined,
  turno: Turno,
  base: BaseHist,
  histPais?: Record<string, HistByYear>,
  ext1?: ExteriorResponse,
): LinhaExt[] {
  const hp = histPais ?? histPorPais(histZz);
  const nomes = new Set<string>([...listaPaises(), ...Object.keys(ext?.paises ?? {})]);
  const out: LinhaExt[] = [];
  for (const pais of nomes) {
    const cds = cidadesDe(pais, ext);
    let ag: ExtAgregado | null = ext?.paises?.[pais] ?? null;
    if (!ag && ext) {
      // país fora de "paises" na resposta: soma as cidades
      const cs = cds.map((cd) => ext.cidades?.[cd]).filter((c): c is ExtCidade => !!c);
      ag = cs.length ? somaAgregados(cs) : null;
    }
    let hist: HistByYear | undefined = hp[pais];
    let baseParcial: { n: number; de: number } | null = null;
    // 1º turno de 2026: mesma base de 2022/2018 (país inteiro ou só as cidades com boletins)
    let pesosT1: (readonly [string, number])[] = cds.map((cd) => [cd, 1] as const);
    if (base === "mesmas" && ext && (ag?.secoesRecebidas ?? 0) > 0) {
      const pesos = cds.map((cd) => [cd, pesoRecebido(ext.cidades?.[cd])] as const);
      const com = pesos.filter(([, w]) => w > 0);
      // país completo (todas as cidades com 100%) → a base é o próprio país inteiro
      if (com.length > 0 && pesos.some(([, w]) => w < 1)) {
        hist = somaHist(com, histZz);
        baseParcial = { n: com.length, de: cds.length };
        pesosT1 = com;
      }
    }
    const t1 = ext1 ? t1Ponderado(pesosT1, ext1) : undefined;
    out.push({
      ...linhaDe({
        id: pais,
        tipo: "pais",
        nome: pais,
        iso2: iso2DoPais(pais, ext, cds),
        ag,
        hist,
        turno,
        candidatos: ext?.candidatos,
        cidades: cds,
        baseParcial,
      }),
      t1,
    });
  }
  return out;
}

/** Linhas das cidades de um país. */
export function linhasCidades(
  cds: string[],
  ext: ExteriorResponse | undefined,
  histZz: HistMunFile | null | undefined,
  turno: Turno,
  nomeFallback: (cd: string) => string | undefined,
  qs: string,
  ext1?: ExteriorResponse,
): LinhaExt[] {
  return cds.map((cd) => {
    const c = ext?.cidades?.[cd];
    const t1 = ext1 ? t1Ponderado([[cd, 1]], ext1) : undefined;
    const l = linhaDe({
      id: cd,
      tipo: "cidade",
      nome: c?.nome || nomeFallback(cd) || cd,
      href: `/cidade/zz/${cd}${qs}`,
      ag: c ?? null,
      hist: histZz?.[cd],
      turno,
      candidatos: ext?.candidatos,
    });
    return t1 === undefined ? l : { ...l, t1 };
  });
}

// ---------------------------------------------------------------------------
// Comparação justa: 2026 × 2022 × 2018 nas MESMAS cidades
// ---------------------------------------------------------------------------

export type Criterio = "completas" | "recebidas";

export interface ConjuntoComparacao {
  criterio: Criterio;
  /** cidades usadas (com boletins e com histórico de 2022 e 2018) */
  cidades: string[];
  paises: number;
  /** cidades que atendem ao critério mas ficaram de fora por não terem histórico */
  excluidas: number;
  ag: ExtAgregado;
  hist: HistByYear;
  pt: LinhaComparacao;
  bo: LinhaComparacao;
  /** comparecimento (% dos aptos) */
  comp26: number | null;
  comp22: number | null;
  comp18: number | null;
}

export function conjuntoComparacao(
  ext: ExteriorResponse | undefined,
  histZz: HistMunFile | null | undefined,
  turno: Turno,
  criterio: Criterio,
): ConjuntoComparacao | null {
  if (!ext) return null;
  const elegiveis = Object.entries(ext.cidades ?? {}).filter(([, c]) =>
    criterio === "completas"
      ? c.secoesTotal > 0 && c.secoesRecebidas >= c.secoesTotal
      : c.secoesRecebidas > 0,
  );
  const usadas = elegiveis.filter(([cd]) => temHistCompleto(histZz, cd, turno));
  const cidades = usadas.map(([cd]) => cd);
  const ag = somaAgregados(usadas.map(([, c]) => c));
  // cidades parciais entram em 2022/2018 com o peso das seções já recebidas
  const hist = somaHist(
    usadas.map(([cd, c]) => [cd, pesoRecebido(c)] as const),
    histZz,
  );
  const com = ag.validos > 0;
  const pt = comparar("pt", { pct: com ? pct(ag.pt, ag.validos) : null, votos: com ? ag.pt : null }, hist, turno);
  const bo = comparar("bolso", { pct: com ? pct(ag.bo, ag.validos) : null, votos: com ? ag.bo : null }, hist, turno);
  const h22 = histDe(hist, "2022", turno);
  const h18 = histDe(hist, "2018", turno);
  const paises = new Set(usadas.map(([cd, c]) => c.pais || paisDaCidade(cd)?.pais || cd)).size;
  return {
    criterio,
    cidades,
    paises,
    excluidas: elegiveis.length - usadas.length,
    ag,
    hist,
    pt,
    bo,
    comp26: pct(ag.comparecimento, ag.aptos),
    comp22: h22 ? pct(h22.comp, h22.ap) : null,
    comp18: h18 ? pct(h18.comp, h18.ap) : null,
  };
}

/** Resultado final do exterior inteiro (todas as cidades do histórico). */
export function histExteriorInteiro(histZz: HistMunFile | null | undefined): HistByYear {
  return somaHist(Object.keys(histZz ?? {}), histZz);
}

/** Candidatos ordenados por votos num agregado. */
export function candidatosOrdenados(
  ag: ExtAgregado | null | undefined,
  candidatos: Candidatos | undefined,
): { n: string; nome: string; partido: string; votos: number; pct: number | null; bloco: BlocoId | null }[] {
  if (!ag) return [];
  const numeros = new Set([...Object.keys(candidatos ?? {}), ...Object.keys(ag.votos ?? {})]);
  return [...numeros]
    .map((n) => {
      const votos = ag.votos?.[n] ?? 0;
      return {
        n,
        nome: nomeCandidato(n, candidatos),
        partido: candidatos?.[n]?.partido ?? "",
        votos,
        pct: pct(votos, ag.validos),
        bloco: blocoDoNumero(n),
      };
    })
    .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR"));
}
