// Utilitários de tempo do painel 1º × 2º turno ("tempo de apuração" = minutos após o fechamento
// das urnas: 17h no 1º turno, 19h no 2º turno — FECHAMENTO_URNAS em src/lib/config.ts).

/** conclusões registradas mais de 12 h após o fechamento são retotalizações (mesmo limite do servidor) */
export const LIMITE_MIN = 12 * 60;

/** "35 min", "1h05", "12h00"; "—" sem valor. */
export function fmtDuracao(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return "—";
  const t = Math.max(0, Math.round(min));
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)}h${String(t % 60).padStart(2, "0")}`;
}

/** Diferença de duração com sinal em palavras: "35 min mais rápido" / "1h10 mais lento" / "mesmo tempo". */
export function fmtDiferenca(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return "—";
  if (Math.abs(min) < 1) return "mesmo tempo";
  return `${fmtDuracao(Math.abs(min))} ${min < 0 ? "mais rápido" : "mais lento"}`;
}

/** Hora (Brasília) de "fechamento + min": "20:35". */
export function relogio(fechamentoIso: string, min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return "—";
  const t = Date.parse(fechamentoIso) + min * 60_000;
  if (!isFinite(t)) return "—";
  return new Date(t).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

/** Minutos entre o fechamento e um instante ISO; null fora de [0, LIMITE_MIN] (retotalização). */
export function minutosApos(iso: string | null | undefined, fechamentoIso: string): number | null {
  if (!iso) return null;
  const m = (Date.parse(iso) - Date.parse(fechamentoIso)) / 60_000;
  if (!isFinite(m) || m > LIMITE_MIN) return null;
  return Math.max(0, m);
}

/**
 * Valor de uma curva (um ponto a cada `passo` minutos) num minuto. Depois do último ponto:
 * o último valor se `encerrado` (nada muda após a conclusão), senão null (futuro desconhecido).
 */
export function valorNaCurva(curva: (number | null)[] | undefined, passo: number, min: number, encerrado: boolean): number | null {
  if (!curva?.length || !isFinite(min) || min < 0) return null;
  const i = Math.floor(min / passo + 1e-9);
  if (i < curva.length) return curva[i];
  return encerrado ? curva[curva.length - 1] : null;
}

/** Estende uma curva encerrada até `n` pontos repetindo o último valor (nada muda após a conclusão). */
export function estender(curva: (number | null)[], n: number): (number | null)[] {
  if (curva.length >= n || !curva.length) return curva;
  const ult = curva[curva.length - 1];
  return [...curva, ...new Array<number | null>(n - curva.length).fill(ult)];
}

/**
 * Curva da vantagem (Lula − Flávio, p.p. dos válidos) somando só os municípios já concluídos,
 * na ordem em que concluíram. `eventos`: [minuto da conclusão, votos Lula, votos Flávio, válidos].
 */
export function curvaVantagem(eventos: [number, number, number, number][], passo: number, fimMin: number): (number | null)[] {
  const ev = eventos.slice().sort((a, b) => a[0] - b[0]);
  const n = Math.max(1, Math.floor(fimMin / passo) + 1);
  const out = new Array<number | null>(n).fill(null);
  let pt = 0;
  let bo = 0;
  let vv = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i * passo;
    while (k < ev.length && ev[k][0] <= t) {
      pt += ev[k][1];
      bo += ev[k][2];
      vv += ev[k][3];
      k++;
    }
    out[i] = vv > 0 ? Math.round(((pt - bo) / vv) * 1000) / 10 : null;
  }
  return out;
}

/** Texto da vantagem: "Lula +3,2" / "Flávio +1,5" / "empate". */
export function fmtVantagem(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) < 0.05) return "empate";
  const n = Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v > 0 ? "Lula" : "Flávio"} +${n}`;
}
