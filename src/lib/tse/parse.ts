// Helpers de parsing dos campos do TSE (strings numéricas, vírgula decimal, datas de Brasília).

/** Inteiro a partir de string do TSE ("123456"). Retorna 0 quando vazio/inválido. */
export function int(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? Math.round(v) : 0;
  if (typeof v !== "string" || v === "") return 0;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? Math.round(n) : 0;
}

/**
 * Decimal a partir de string do TSE ("7,527528669" ou "100"). Retorna null quando vazio/inválido.
 * Aceita "1.234,56" (milhar com ponto) e "7.5" (ponto decimal, sem vírgula).
 */
export function dec(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return isFinite(n) ? n : null;
}

/** Arredonda para `casas` decimais (evita ruído de ponto flutuante no JSON). */
export function round(n: number, casas = 4): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** "dd/mm/yyyy" + "HH:MM:SS" (horário de Brasília) → ISO "yyyy-mm-ddTHH:MM:SS-03:00". */
export function dataHoraBrasilia(data: unknown, hora: unknown): string | null {
  if (typeof data !== "string" || typeof hora !== "string") return null;
  const md = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  const mh = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hora.trim());
  if (!md || !mh) return null;
  return `${md[3]}-${md[2]}-${md[1]}T${mh[1]}:${mh[2]}:${mh[3] ?? "00"}-03:00`;
}

/** Carimbo ordenável "yyyymmddHHMMSS" a partir de dd/mm/yyyy + HH:MM:SS (ou "" se ausente). */
export function carimbo(data: unknown, hora: unknown): string {
  const iso = dataHoraBrasilia(data, hora);
  return iso ? iso.slice(0, 19).replace(/[-T:]/g, "") : "";
}
