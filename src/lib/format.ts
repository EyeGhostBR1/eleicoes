// Formatação pt-BR.

const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfCompact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export const TRACO = "—";

export function fmtInt(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? TRACO : nfInt.format(n);
}

export function fmtCompact(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? TRACO : nfCompact.format(n);
}

/** 47,23% */
export function fmtPct(n: number | null | undefined, casas: 1 | 2 = 2): string {
  if (n == null || !isFinite(n)) return TRACO;
  return (casas === 1 ? nfPct1 : nfPct).format(n) + "%";
}

/** +1,23 p.p. / −0,40 p.p. */
export function fmtPP(n: number | null | undefined, casas: 1 | 2 = 1): string {
  if (n == null || !isFinite(n)) return TRACO;
  const abs = (casas === 1 ? nfPct1 : nfPct).format(Math.abs(n));
  const sinal = n > 0.0001 ? "+" : n < -0.0001 ? "−" : "±";
  return `${sinal}${abs} p.p.`;
}

/** "04/10/2026 18:32:10" a partir de ISO. */
export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return TRACO;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return TRACO;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** "18:32" a partir de ISO (horário de Brasília). */
export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return TRACO;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return TRACO;
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
