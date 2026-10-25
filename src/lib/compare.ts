// Helpers puros de comparação entre 2026 (ao vivo) e 2022/2018 (finais).
import type { AnoHist, BlocoId, HistByYear, HistResult, LiveMunRow, LiveResult, Turno } from "./types";

/** Percentual seguro (0–100). Retorna null quando o denominador é 0/ausente. */
export function pct(parte: number | undefined | null, total: number | undefined | null): number | null {
  if (parte == null || total == null || !isFinite(parte) || !isFinite(total) || total <= 0) return null;
  return (parte / total) * 100;
}

/** Diferença em pontos percentuais (a − b). null se algum lado faltar. */
export function deltaPP(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
  return a - b;
}

/** Resultado histórico de um lugar para ano/turno. */
export function histDe(h: HistByYear | undefined | null, ano: AnoHist, turno: Turno): HistResult | null {
  return h?.[ano]?.[String(turno) as "1" | "2"] ?? null;
}

/** % de votos válidos do bloco num resultado histórico. */
export function histPctBloco(h: HistResult | null | undefined, bloco: BlocoId): number | null {
  if (!h) return null;
  return pct(bloco === "pt" ? h.pt : h.bo, h.vv);
}

/** % de votos válidos do bloco num resultado ao vivo (usa o % do TSE quando houver). */
export function livePctBloco(r: LiveResult | null | undefined, bloco: BlocoId): number | null {
  const c = r?.blocos?.[bloco];
  if (!r || !c) return null;
  if (isFinite(c.pct) && r.totais.validos > 0) return c.pct;
  return pct(c.votos, r.totais.validos);
}

/** % de votos válidos do bloco numa linha compacta de município. */
export function munPctBloco(row: LiveMunRow | null | undefined, bloco: BlocoId): number | null {
  if (!row) return null;
  return pct(bloco === "pt" ? row.pt : row.bo, row.vv);
}

/** Comparecimento (%) de um resultado histórico. */
export function histPctComparecimento(h: HistResult | null | undefined): number | null {
  return h ? pct(h.comp, h.ap) : null;
}

export interface LinhaComparacao {
  bloco: BlocoId;
  p2026: number | null;
  p2022: number | null;
  p2018: number | null;
  /** Δ p.p. 2026 − 2022 */
  d22: number | null;
  /** Δ p.p. 2026 − 2018 */
  d18: number | null;
  votos2026: number | null;
  votos2022: number | null;
  votos2018: number | null;
}

/** Monta a linha de comparação de um bloco para um lugar. */
export function comparar(
  bloco: BlocoId,
  live: { pct: number | null; votos: number | null },
  hist: HistByYear | undefined | null,
  turno: Turno,
): LinhaComparacao {
  const h22 = histDe(hist, "2022", turno);
  const h18 = histDe(hist, "2018", turno);
  const p2022 = histPctBloco(h22, bloco);
  const p2018 = histPctBloco(h18, bloco);
  return {
    bloco,
    p2026: live.pct,
    p2022,
    p2018,
    d22: deltaPP(live.pct, p2022),
    d18: deltaPP(live.pct, p2018),
    votos2026: live.votos,
    votos2022: h22 ? (bloco === "pt" ? h22.pt : h22.bo) : null,
    votos2018: h18 ? (bloco === "pt" ? h18.pt : h18.bo) : null,
  };
}

/** Atalho: comparação de um bloco a partir de um LiveResult. */
export function compararLive(
  bloco: BlocoId,
  r: LiveResult | null | undefined,
  hist: HistByYear | undefined | null,
  turno: Turno,
): LinhaComparacao {
  return comparar(bloco, { pct: livePctBloco(r, bloco), votos: r?.blocos?.[bloco]?.votos ?? null }, hist, turno);
}

/** Atalho: comparação de um bloco a partir de uma linha de município. */
export function compararMun(
  bloco: BlocoId,
  row: LiveMunRow | null | undefined,
  hist: HistByYear | undefined | null,
  turno: Turno,
): LinhaComparacao {
  return comparar(
    bloco,
    { pct: munPctBloco(row, bloco), votos: row ? (bloco === "pt" ? row.pt : row.bo) : null },
    hist,
    turno,
  );
}

/** Margem (p.p.) PT − Bolsonaro; positivo = PT à frente. */
export function margem(ptPct: number | null, boPct: number | null): number | null {
  return deltaPP(ptPct, boPct);
}

/** Normaliza texto para busca sem acento/caixa. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
