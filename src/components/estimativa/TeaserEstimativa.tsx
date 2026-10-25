"use client";
// Cartão compacto da página inicial: "Estimativa do resultado final" com link para /estimativa.
// Números só aparecem quando a API indica disponivel = true.
import Link from "next/link";
import { useParamsState } from "@/lib/client/hooks";
import { BLOCOS } from "@/lib/config";
import { fmtPct } from "@/lib/format";
import { Card, Dot, Skeleton, corTextoBloco, cx } from "../ui";
import { useEstimativa } from "./useEstimativa";
import { BLOCOS_ORDEM, NOME_26, calcularVeredito, faixaDe } from "./util";

export default function TeaserEstimativa({ className }: { className?: string }) {
  const { turno, qs } = useParamsState();
  const { data, error } = useEstimativa();
  const br = data?.disponivel ? data.br : null;
  const veredito = br ? calcularVeredito(data, turno) : null;
  const carregando = !data && !error;

  return (
    <Card className={cx("p-4", className)} aria-labelledby="teaser-estimativa">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="teaser-estimativa" className="text-base font-semibold text-strong">
            Estimativa do resultado final
          </h2>
          {br ? (
            <p className="text-xs text-muted">
              Se a apuração terminasse agora · com {fmtPct(br.pctTotalizado, 1)} apurado
              {veredito ? (
                <>
                  {" · "}
                  <span className="font-semibold text-fg">{veredito.titulo}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-muted">
              {carregando
                ? "Carregando…"
                : "Projeção do resultado final a partir do parcial, comparada com 2022 e 2018 — aparece quando o TSE começar a divulgar a apuração (17h)."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
          {br &&
            BLOCOS_ORDEM.map((b) => {
              const f = faixaDe(data, b);
              return (
                <p key={b} className="flex items-baseline gap-1.5">
                  <Dot cor={BLOCOS[b].cor} className="self-center" />
                  <span className="text-sm text-muted">{NOME_26[b]}</span>
                  <span className="text-xl font-bold tracking-tight" style={{ color: corTextoBloco(b) }}>
                    {fmtPct(br.cenarios.base2022[b].pct, 1)}
                  </span>
                  {f && (
                    <span className="hidden text-xs text-muted md:inline">
                      ({fmtPct(f[0], 1)}–{fmtPct(f[1], 1)})
                    </span>
                  )}
                </p>
              );
            })}
          {carregando && <Skeleton className="h-6 w-40" />}
          <Link
            href={`/estimativa${qs}`}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold text-strong hover:bg-surface"
          >
            {br ? "Ver estimativa →" : "Como funciona →"}
          </Link>
        </div>
      </div>
    </Card>
  );
}
