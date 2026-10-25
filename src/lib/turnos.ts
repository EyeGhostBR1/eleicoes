// Comparação 1º × 2º turno da MESMA eleição (2026): onde Lula e Flávio cresceram ou caíram.
//
// Duas medidas, porque contam histórias diferentes:
//  - p.p. dos válidos: no 2º turno só restam dois candidatos, então o % de ambos tende a subir
//    em quase todo lugar (herdam os votos dos eliminados). "Caiu em %" é raro e significativo.
//  - votos absolutos: podem cair (mais abstenção, voto em branco/nulo) — mostra perda real.
// E o saldo relativo: Δ margem (Lula − Flávio) entre os turnos = quem herdou mais.
import { deltaPP, pct } from "./compare";
import type { BlocoId, ExtAgregado, LiveMunRow, LiveResult } from "./types";

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

/** Variação de um bloco entre os turnos. */
export interface DeltaTurno {
  /** % 1º turno e % 2º turno (dos válidos) */
  p1: number | null;
  p2: number | null;
  /** Δ p.p. (2º − 1º) */
  dpp: number | null;
  v1: number | null;
  v2: number | null;
  /** Δ votos (2º − 1º); só faz sentido com o 2º turno 100% apurado no lugar */
  dv: number | null;
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
  /** Δ da margem Lula − Flávio (p.p.): positivo = Lula ganhou mais terreno que Flávio */
  dMargem: number | null;
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

function delta(v1: ValTurno | null, v2: ValTurno | null, b: BlocoId): DeltaTurno {
  const p1 = v1 ? (b === "pt" ? v1.pt : v1.bo) : null;
  const p2 = v2 ? (b === "pt" ? v2.pt : v2.bo) : null;
  const n1 = v1 ? (b === "pt" ? v1.vpt : v1.vbo) : null;
  const n2 = v2 ? (b === "pt" ? v2.vpt : v2.vbo) : null;
  return { p1, p2, dpp: deltaPP(p2, p1), v1: n1, v2: n2, dv: n1 != null && n2 != null ? n2 - n1 : null };
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
    dMargem: pt.dpp != null && bo.dpp != null ? pt.dpp - bo.dpp : null,
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
