// Comparação 1º × 2º turno da MESMA eleição (2026): onde Lula e Flávio cresceram ou caíram.
//
// A medida principal é o crescimento em VOTOS, comparado com os próprios votos do 1º turno
// (absoluto e em %). O % dos válidos engana: com só dois candidatos no 2º turno, o % de ambos
// sobe em quase todo lugar só porque os outros candidatos saíram.
// Votos só são comparáveis com o 2º turno 100% apurado no lugar (`completo`); antes disso o
// crescimento fica null (a contagem parcial pareceria queda).
import { deltaPP, pct } from "./compare";
import type { BlocoId, ExtAgregado, HistResult, LiveMunRow, LiveResult } from "./types";

/** Valores de um lugar num turno. */
export interface ValTurno {
  /** % dos válidos */
  pt: number | null;
  bo: number | null;
  /** votos */
  vpt: number;
  vbo: number;
  vv: number;
  comp: number;
  ap: number;
  /** % seções totalizadas */
  pa: number;
}

export function valTurnoDeLive(r: LiveResult | null | undefined): ValTurno | null {
  if (!r || !(r.totais.validos > 0)) return null;
  const vpt = r.blocos?.pt?.votos ?? 0;
  const vbo = r.blocos?.bolso?.votos ?? 0;
  return {
    pt: pct(vpt, r.totais.validos),
    bo: pct(vbo, r.totais.validos),
    vpt,
    vbo,
    vv: r.totais.validos,
    comp: r.totais.comparecimento,
    ap: r.totais.eleitorado,
    pa: r.totais.pctTotalizado,
  };
}

export function valTurnoDeMun(row: LiveMunRow | null | undefined): ValTurno | null {
  if (!row || !(row.vv > 0)) return null;
  return {
    pt: pct(row.pt, row.vv),
    bo: pct(row.bo, row.vv),
    vpt: row.pt,
    vbo: row.bo,
    vv: row.vv,
    comp: row.comp,
    ap: row.ap,
    pa: row.pa,
  };
}

/** Valores a partir dos boletins de urna do exterior (pa = % das seções com boletim recebido). */
export function valTurnoDeExt(ag: ExtAgregado | null | undefined): ValTurno | null {
  if (!ag || !(ag.validos > 0)) return null;
  return {
    pt: pct(ag.pt, ag.validos),
    bo: pct(ag.bo, ag.validos),
    vpt: ag.pt,
    vbo: ag.bo,
    vv: ag.validos,
    comp: ag.comparecimento,
    ap: ag.aptos,
    pa: ag.secoesTotal > 0 ? Math.min(100, (ag.secoesRecebidas / ag.secoesTotal) * 100) : 0,
  };
}

/** Valores de um resultado final histórico (2022/2018) — sempre 100% apurado. */
export function valTurnoDeHist(h: HistResult | null | undefined): ValTurno | null {
  if (!h || !(h.vv > 0)) return null;
  return { pt: pct(h.pt, h.vv), bo: pct(h.bo, h.vv), vpt: h.pt, vbo: h.bo, vv: h.vv, comp: h.comp, ap: h.ap, pa: 100 };
}

/** Variação de um bloco entre os turnos. */
export interface DeltaTurno {
  /** % 1º turno e % 2º turno (dos válidos) */
  p1: number | null;
  p2: number | null;
  /** Δ p.p. (2º − 1º) */
  dpp: number | null;
  v1: number | null;
  v2: number | null;
  /** Δ votos (2º − 1º); só com o 2º turno 100% apurado no lugar */
  dv: number | null;
  /** crescimento dos votos em relação aos do 1º turno (%): (v2 ÷ v1 − 1) × 100; só com 100% apurado */
  cresc: number | null;
}

export interface LinhaTurnos {
  id: string;
  nome: string;
  /** sufixo curto (ex.: sigla da UF) */
  sub?: string;
  href?: string;
  t1: ValTurno | null;
  t2: ValTurno | null;
  pt: DeltaTurno;
  bo: DeltaTurno;
  /** 2º turno 100% apurado no lugar (votos comparáveis com o 1º turno) */
  completo: boolean;
  /**
   * Saldo de votos novos: (votos ganhos por Lula − votos ganhos por Flávio) ÷ válidos do 1º turno × 100.
   * Positivo = Lula ganhou mais votos que Flávio entre os turnos. Só com 100% apurado.
   */
  saldo: number | null;
  /** quem liderava no 1º e lidera no 2º turno (só entre Lula e Flávio) */
  lider1: BlocoId | null;
  lider2: BlocoId | null;
  /** liderança trocou de lado entre os turnos */
  virou: boolean;
  /** eleitorado (peso para ordenações/filtros) */
  peso: number;
}

function liderVal(v: ValTurno | null): BlocoId | null {
  if (!v || v.vpt === v.vbo) return null;
  return v.vpt > v.vbo ? "pt" : "bolso";
}

/** 2º turno totalmente apurado (pa = % de seções totalizadas / boletins recebidos). */
export function turnoCompleto(v: ValTurno | null): boolean {
  return (v?.pa ?? 0) >= 99.995;
}

function delta(v1: ValTurno | null, v2: ValTurno | null, b: BlocoId): DeltaTurno {
  const p1 = v1 ? (b === "pt" ? v1.pt : v1.bo) : null;
  const p2 = v2 ? (b === "pt" ? v2.pt : v2.bo) : null;
  const n1 = v1 ? (b === "pt" ? v1.vpt : v1.vbo) : null;
  const n2 = v2 ? (b === "pt" ? v2.vpt : v2.vbo) : null;
  const ok = n1 != null && n2 != null && turnoCompleto(v2);
  return {
    p1,
    p2,
    dpp: deltaPP(p2, p1),
    v1: n1,
    v2: n2,
    dv: ok ? n2 - n1 : null,
    cresc: ok && n1 > 0 ? (n2 / n1 - 1) * 100 : null,
  };
}

export function linhaTurnos(
  base: { id: string; nome: string; sub?: string; href?: string },
  t1: ValTurno | null,
  t2: ValTurno | null,
): LinhaTurnos {
  const pt = delta(t1, t2, "pt");
  const bo = delta(t1, t2, "bolso");
  const lider1 = liderVal(t1);
  const lider2 = liderVal(t2);
  return {
    ...base,
    t1,
    t2,
    pt,
    bo,
    completo: turnoCompleto(t2),
    saldo: pt.dv != null && bo.dv != null && t1 && t1.vv > 0 ? ((pt.dv - bo.dv) / t1.vv) * 100 : null,
    lider1,
    lider2,
    virou: !!lider1 && !!lider2 && lider1 !== lider2,
    peso: t2?.ap || t1?.ap || 0,
  };
}

/** Comparecimento (% do eleitorado) de um turno. */
export function pctComparecimento(v: ValTurno | null): number | null {
  return v ? pct(v.comp, v.ap) : null;
}
