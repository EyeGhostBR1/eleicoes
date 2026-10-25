// Aviso de comparação parcial (2026 em apuração vs 2022/2018 finais).
import { fmtPct } from "@/lib/format";

export default function AvisoParcial({ pct }: { pct: number | null | undefined }) {
  if (pct == null || !isFinite(pct) || pct >= 100) return null;
  return (
    <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-muted">
      <span aria-hidden>ⓘ </span>
      2026 em apuração ({fmtPct(pct)} das seções); 2022 e 2018 são resultados finais.
    </p>
  );
}
