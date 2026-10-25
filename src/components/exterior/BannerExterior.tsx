"use client";
// Banner do /estado/zz apontando para /exterior (resultados por país a partir dos boletins de urna).
import Link from "next/link";
import { pct } from "@/lib/compare";
import { useParamsState } from "@/lib/client/hooks";
import { fmtInt, fmtPct } from "@/lib/format";
import { useExteriorOk } from "../useDados";

export default function BannerExterior() {
  const { qs } = useParamsState();
  const { data } = useExteriorOk();
  const t = data?.total;
  const tem = !!t && t.secoesRecebidas > 0 && t.validos > 0;
  return (
    <Link
      href={`/exterior${qs}`}
      className="group block rounded-xl border-2 border-strong/15 bg-surface p-4 shadow-sm transition-colors hover:border-strong/40 hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-strong sm:text-lg">
            <span aria-hidden>🌎 </span>Resultados por país
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Boletins de urna das seções no exterior já recebidos pelo TSE — antes da totalização das 17h — agregados por país
            e comparados com 2022 e 2018 nas mesmas cidades.
          </p>
          {tem && (
            <p className="mt-1.5 text-sm text-fg">
              <span className="font-medium">
                {fmtInt(t.secoesRecebidas)} de {fmtInt(t.secoesTotal)} seções
              </span>{" "}
              · Lula{" "}
              <span className="font-semibold" style={{ color: "var(--c-pt)" }}>
                {fmtPct(pct(t.pt, t.validos), 1)}
              </span>{" "}
              × Flávio{" "}
              <span className="font-semibold" style={{ color: "var(--c-bolso)" }}>
                {fmtPct(pct(t.bo, t.validos), 1)}
              </span>
            </p>
          )}
        </div>
        <span aria-hidden className="shrink-0 text-2xl text-muted transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
    </Link>
  );
}
