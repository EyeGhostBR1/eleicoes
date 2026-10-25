"use client";
// Cartão da página inicial: boletins de urna do exterior já recebidos (total Lula × Flávio,
// comparação nas mesmas cidades e os 5 países com mais votos recebidos).
import Link from "next/link";
import { useMemo } from "react";
import { useParamsState } from "@/lib/client/hooks";
import { fmtInt, fmtPct } from "@/lib/format";
import { Card, DeltaPP, ErroCarga } from "../ui";
import { useExteriorOk, useHistMun } from "../useDados";
import { conjuntoComparacao, linhasPaises } from "./dados";
import { Bandeira, CarregandoExterior, Placar, SemBoletins, StatusExterior } from "./partes";

export default function CardExteriorHome() {
  const { turno, qs } = useParamsState();
  const ext = useExteriorOk();
  const histZz = useHistMun("zz");
  const data = ext.data;

  const justa = useMemo(() => conjuntoComparacao(data, histZz.data, turno, "recebidas"), [data, histZz.data, turno]);
  const top = useMemo(
    () =>
      linhasPaises(data, histZz.data, turno, "mesmas")
        .filter((l) => (l.validos ?? 0) > 0)
        .sort((a, b) => (b.validos ?? 0) - (a.validos ?? 0))
        .slice(0, 5),
    [data, histZz.data, turno],
  );
  const tem = !!data && data.total.secoesRecebidas > 0 && data.total.validos > 0;
  const href = `/exterior${qs}`;

  return (
    <Card className="p-4 sm:p-5" aria-labelledby="home-exterior">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="home-exterior" className="text-lg font-semibold tracking-tight text-strong sm:text-xl">
            Exterior — boletins de urna já recebidos
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Seções no exterior já encerradas, publicadas pelo TSE antes da totalização · parcial
          </p>
        </div>
        <Link href={href} className="text-sm font-medium text-strong underline underline-offset-2 hover:text-fg">
          Ver todos os países →
        </Link>
      </div>

      {!data ? (
        ext.error?.status === 404 ? (
          <SemBoletins turno={turno} compacto />
        ) : ext.error ? (
          <ErroCarga msg={`Boletins do exterior: ${ext.error.message}`} onRetry={ext.mutate} />
        ) : (
          <CarregandoExterior compacto />
        )
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="space-y-4">
            <StatusExterior data={data} error={ext.error} isValidating={ext.isValidating} mutate={ext.mutate} compacto />
            {tem ? (
              <Placar ag={data.total} tamanho="md" />
            ) : (
              <p className="text-sm text-muted">Nenhum boletim com votos recebido ainda.</p>
            )}
            {tem && justa && justa.ag.validos > 0 && (
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                <p>
                  <span className="font-medium text-fg">Nas mesmas {fmtInt(justa.cidades.length)} cidades em 2022:</span> Lula{" "}
                  <span className="font-medium" style={{ color: "var(--c-pt)" }}>
                    {fmtPct(justa.pt.p2022, 1)}
                  </span>{" "}
                  · Jair{" "}
                  <span className="font-medium" style={{ color: "var(--c-bolso)" }}>
                    {fmtPct(justa.bo.p2022, 1)}
                  </span>
                </p>
                <p className="mt-0.5">
                  Variação: Lula <DeltaPP v={justa.pt.d22} /> · Flávio vs Jair <DeltaPP v={justa.bo.d22} />
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Países com mais votos recebidos
            </p>
            {top.length === 0 ? (
              <p className="text-sm text-muted">Aguardando os primeiros boletins.</p>
            ) : (
              <ol className="divide-y divide-line rounded-lg border border-line">
                {top.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Bandeira iso2={l.iso2} />
                      <span className="truncate font-medium text-strong">{l.nome}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {fmtInt(l.validos)} votos
                        {l.secoesTotal != null && l.secoesRecebidas < l.secoesTotal
                          ? ` · ${fmtInt(l.secoesRecebidas)}/${fmtInt(l.secoesTotal)} seções`
                          : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs">
                      <span className="whitespace-nowrap" title="Lula 2026 e variação vs Lula 2022">
                        <span className="font-semibold" style={{ color: "var(--c-pt)" }}>
                          {fmtPct(l.pt.p2026, 1)}
                        </span>{" "}
                        <DeltaPP v={l.pt.d22} semSufixo />
                      </span>
                      <span className="whitespace-nowrap" title="Flávio 2026 e variação vs Jair 2022">
                        <span className="font-semibold" style={{ color: "var(--c-bolso)" }}>
                          {fmtPct(l.bo.p2026, 1)}
                        </span>{" "}
                        <DeltaPP v={l.bo.d22} semSufixo />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-1.5 text-[11px] text-muted">
              <span style={{ color: "var(--c-pt)" }}>Lula</span> e <span style={{ color: "var(--c-bolso)" }}>Flávio</span>{" "}
              (% dos válidos) · Δ vs 2022 nas mesmas cidades.{" "}
              <Link href={href} className="underline underline-offset-2 hover:text-fg">
                Ver todos os países →
              </Link>
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
