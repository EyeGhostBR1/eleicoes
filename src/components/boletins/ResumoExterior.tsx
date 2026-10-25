"use client";
// "Exterior agora (boletins de urna)": resumo compacto no topo de /boletins com o total do exterior
// (Lula × Flávio) somado dos boletins de urna oficiais já recebidos pelo TSE, antes da totalização das 17h.
import Link from "next/link";
import { useMemo } from "react";
import { BLOCOS } from "@/lib/config";
import { pct } from "@/lib/compare";
import { useExterior, useParamsState } from "@/lib/client/hooks";
import { fmtHora, fmtInt, fmtPct } from "@/lib/format";
import type { ExteriorResponse } from "@/lib/types";
import { cx } from "./util";

/** Países em que Lula / Flávio estão em 1º lugar (entre TODOS os candidatos; empate não conta). */
function liderancas(d: ExteriorResponse): { pt: number; bolso: number; total: number } {
  let pt = 0;
  let bolso = 0;
  let total = 0;
  for (const p of Object.values(d.paises ?? {})) {
    if (!p || p.secoesRecebidas <= 0 || p.validos <= 0) continue;
    total++;
    const outros = Object.entries(p.votos ?? {})
      .filter(([n]) => n !== BLOCOS.pt.numeros["2026"] && n !== BLOCOS.bolso.numeros["2026"])
      .reduce((m, [, v]) => Math.max(m, v), 0);
    if (p.pt > p.bo && p.pt > outros) pt++;
    else if (p.bo > p.pt && p.bo > outros) bolso++;
  }
  return { pt, bolso, total };
}

export default function ResumoExterior({
  filtroAtivo,
  onFiltrar,
  nBoletins,
}: {
  /** filtro "Exterior" da lista ligado */
  filtroAtivo: boolean;
  onFiltrar: () => void;
  /** boletins da imprensa sobre o exterior na lista atual */
  nBoletins: number | null;
}) {
  const { turno, qs } = useParamsState();
  const { data, error, isLoading } = useExterior();
  const d = data && data.turno === turno ? data : undefined;
  const t = d?.total;
  const tem = !!t && t.secoesRecebidas > 0 && t.validos > 0;
  const lid = useMemo(() => (d ? liderancas(d) : null), [d]);
  const ptPct = tem ? pct(t.pt, t.validos) : null;
  const boPct = tem ? pct(t.bo, t.validos) : null;

  const botaoFiltro = (
    <button
      type="button"
      aria-pressed={filtroAtivo}
      onClick={onFiltrar}
      className={cx(
        "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        filtroAtivo
          ? "border-sky-700 bg-sky-700 text-white dark:border-sky-300 dark:bg-sky-300 dark:text-sky-950"
          : "border-sky-300 bg-white text-sky-800 hover:border-sky-500 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
      )}
    >
      {filtroAtivo ? "Mostrando boletins do exterior" : "Ver boletins do exterior"}
      {nBoletins != null && <span className="ml-1 tabular-nums opacity-80">({nBoletins})</span>}
    </button>
  );

  return (
    <section
      aria-labelledby="resumo-exterior-titulo"
      className="mb-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3 sm:p-4 dark:border-sky-900/70 dark:bg-sky-950/20"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="resumo-exterior-titulo" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Exterior agora <span className="font-normal text-zinc-600 dark:text-zinc-400">(boletins de urna)</span>
        </h2>
        <Link
          href={`/exterior${qs}`}
          className="text-xs font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 hover:decoration-sky-700 dark:text-sky-300 dark:decoration-sky-700"
        >
          Resultados por país →
        </Link>
      </div>

      {tem ? (
        <>
          <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-1 tabular-nums">
            {(["pt", "bolso"] as const).map((b) => (
              <p key={b} className="flex items-baseline gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 translate-y-[-1px] rounded-full" style={{ background: BLOCOS[b].cor }} />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {b === "pt" ? "Lula" : "Flávio"}
                </span>
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{fmtPct(b === "pt" ? ptPct : boPct, 1)}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {fmtInt(b === "pt" ? t.pt : t.bo)} votos
                </span>
              </p>
            ))}
          </div>
          {/* barra Lula × Flávio (dos votos válidos) */}
          <div aria-hidden className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <span style={{ width: `${ptPct ?? 0}%`, background: BLOCOS.pt.cor }} />
            <span className="flex-1" />
            <span style={{ width: `${boPct ?? 0}%`, background: BLOCOS.bolso.cor }} />
          </div>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            {fmtInt(t.secoesRecebidas)} de {fmtInt(t.secoesTotal)} seções do exterior com boletim de urna recebido pelo TSE
            {d?.ultimaRecepcao ? ` · último às ${fmtHora(d.ultimaRecepcao)}` : ""}
            {lid && lid.total > 0
              ? ` · Lula à frente em ${lid.pt} ${lid.pt === 1 ? "país" : "países"}, Flávio em ${lid.bolso}`
              : ""}
            . Parcial: % dos votos válidos das seções já recebidas.
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {isLoading && !error ? (
            <span className="inline-block h-3 w-48 animate-pulse rounded bg-zinc-200 align-middle dark:bg-zinc-800" />
          ) : error?.status === 404 ? (
            `Os boletins de urna do exterior ainda não foram publicados para o ${turno}º turno.`
          ) : error ? (
            "Não foi possível carregar os boletins de urna do exterior agora."
          ) : (
            "Nenhuma seção do exterior com boletim de urna recebido ainda."
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {botaoFiltro}
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Os boletins da imprensa sobre países e cidades do exterior já vêm conferidos com os boletins de urna.
        </span>
      </div>
    </section>
  );
}
