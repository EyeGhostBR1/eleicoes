// Montagem das linhas de tabela/mapa a partir dos dados ao vivo + históricos.
import { compararLive, compararMun, deltaPP, histDe, pct } from "@/lib/compare";
import type { UFInfo } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import type {
  BlocoId,
  ExteriorResponse,
  HistByYear,
  HistMunFile,
  LiveMunRow,
  LiveResult,
  MunicipioTuple,
  Turno,
} from "@/lib/types";
import { conjuntoComparacao, liderDe as liderBU, pctRecebido } from "./exterior/dados";
import type { DadosMapa } from "./MapaMetricas";
import { valoresDeLinhas } from "./metricas";
import type { LinhaLugar } from "./TabelaComparativa";

export type CandPorNumero = Map<string, { nome: string; bloco: BlocoId | null }>;

/** Índice número → {nome, bloco} a partir de um resultado ao vivo. */
export function candidatosPorNumero(live: LiveResult | null | undefined): CandPorNumero {
  const m: CandPorNumero = new Map();
  if (!live) return m;
  for (const c of live.candidatos) {
    const bloco: BlocoId | null = live.blocos?.pt?.n === c.n ? "pt" : live.blocos?.bolso?.n === c.n ? "bolso" : null;
    m.set(c.n, { nome: c.nome, bloco });
  }
  return m;
}

export function liderDe(live: LiveResult | null | undefined): LinhaLugar["lider"] {
  const c = live?.candidatos?.[0];
  if (!live || !c || !(c.votos > 0)) return null;
  const bloco: BlocoId | null = live.blocos?.pt?.n === c.n ? "pt" : live.blocos?.bolso?.n === c.n ? "bolso" : null;
  return { nome: c.nome, bloco };
}

function pesoHist(hist: HistByYear | null | undefined, turno: Turno): number | null {
  return histDe(hist, "2022", turno)?.ap ?? histDe(hist, "2022", 1)?.ap ?? null;
}

export function linhaEstado(
  u: UFInfo,
  live: LiveResult | null | undefined,
  hist: HistByYear | null | undefined,
  turno: Turno,
  qs: string,
): LinhaLugar {
  return {
    id: u.sigla,
    nome: u.nome,
    sub: u.sigla === "zz" ? undefined : u.sigla.toUpperCase(),
    href: `/estado/${u.sigla}${qs}`,
    pa: live ? live.totais.pctTotalizado : null,
    pt: compararLive("pt", live, hist, turno),
    bo: compararLive("bolso", live, hist, turno),
    lider: liderDe(live),
    peso: live?.totais.eleitorado || pesoHist(hist, turno),
  };
}

export function linhaBrasil(
  live: LiveResult | null | undefined,
  hist: HistByYear | null | undefined,
  turno: Turno,
  qs: string,
): LinhaLugar {
  return {
    id: "br",
    nome: "Brasil",
    href: `/${qs}`,
    pa: live ? live.totais.pctTotalizado : null,
    pt: compararLive("pt", live, hist, turno),
    bo: compararLive("bolso", live, hist, turno),
    lider: liderDe(live),
  };
}

export function linhaMunicipio(
  t: MunicipioTuple,
  row: LiveMunRow | null | undefined,
  hist: HistByYear | null | undefined,
  turno: Turno,
  qs: string,
  cands: CandPorNumero,
): LinhaLugar {
  const [cd, nome, uf] = t;
  let lider: LinhaLugar["lider"] = null;
  if (row && row.vv > 0) {
    if (row.lid) {
      const c = cands.get(row.lid);
      lider = c ? { nome: c.nome, bloco: c.bloco } : { nome: `nº ${row.lid}`, bloco: null };
    } else if (row.pt !== row.bo) {
      // sem o líder informado: usa o confronto direto Lula × Flávio
      lider = row.pt > row.bo ? { nome: "Lula", bloco: "pt" } : { nome: "Flávio", bloco: "bolso" };
    }
  }
  return {
    id: cd,
    nome,
    href: `/cidade/${uf}/${cd}${qs}`,
    pa: row ? row.pa : null,
    pt: compararMun("pt", row, hist, turno),
    bo: compararMun("bolso", row, hist, turno),
    lider,
    peso: row?.ap || pesoHist(hist, turno),
  };
}

export function dadosMapaDeLinha(l: LinhaLugar): DadosMapa {
  return { nome: l.sub ? `${l.nome} (${l.sub})` : l.nome, pa: l.pa, ...valoresDeLinhas(l.pt, l.bo) };
}

/**
 * Linha "Exterior" da tabela de estados quando o TSE ainda não totalizou o exterior
 * (ufs.zz ausente ou 0% totalizado): usa os boletins de urna já recebidos (/api/exterior).
 *  - modo "hist" (antes das 17h): mantém 2022/2018 e só acrescenta o selo "BU" + link para /exterior;
 *  - modo "live": 2026 = total dos boletins; Δ calculado nas MESMAS cidades em 2022/2018.
 */
export function linhaExteriorBU(
  base: LinhaLugar,
  zzTse: LiveResult | null | undefined,
  ext: ExteriorResponse | undefined,
  histZz: HistMunFile | null | undefined,
  turno: Turno,
  qs: string,
  modoLive: boolean,
): LinhaLugar {
  if (zzTse && zzTse.totais.pctTotalizado > 0) return base;
  const t = ext?.total;
  if (!ext || !t || !(t.secoesRecebidas > 0) || !(t.validos > 0)) return base;
  const ptPct = pct(t.pt, t.validos);
  const boPct = pct(t.bo, t.validos);
  const secoes = `${fmtInt(t.secoesRecebidas)} de ${fmtInt(t.secoesTotal)} seções`;
  const href = `/exterior${qs}`;
  if (!modoLive) {
    return {
      ...base,
      href,
      selo: {
        texto: "BU",
        titulo: `Boletins de urna já recebidos (${secoes}): Lula ${fmtPct(ptPct, 1)} × Flávio ${fmtPct(boPct, 1)} — parcial. Clique para ver por país.`,
      },
    };
  }
  const justa = conjuntoComparacao(ext, histZz, turno, "recebidas");
  const usaJusta = !!justa && justa.ag.validos > 0 && justa.pt.p2022 != null;
  const pt = usaJusta
    ? { ...justa.pt, p2026: ptPct, votos2026: t.pt }
    : { ...base.pt, p2026: ptPct, votos2026: t.pt, d22: deltaPP(ptPct, base.pt.p2022), d18: deltaPP(ptPct, base.pt.p2018) };
  const bo = usaJusta
    ? { ...justa.bo, p2026: boPct, votos2026: t.bo }
    : { ...base.bo, p2026: boPct, votos2026: t.bo, d22: deltaPP(boPct, base.bo.p2022), d18: deltaPP(boPct, base.bo.p2018) };
  const lid = liderBU(t, ext.candidatos);
  return {
    ...base,
    href,
    pa: pctRecebido(t),
    pt,
    bo,
    lider: lid ? { nome: lid.nome, bloco: lid.bloco } : null,
    selo: {
      texto: "BU",
      titulo: `Boletins de urna recebidos (${secoes}); parcial. "% apurado" = seções com boletim. Δ ${
        usaJusta ? "calculado nas mesmas cidades em 2022/2018" : "vs exterior inteiro"
      }.`,
    },
  };
}
