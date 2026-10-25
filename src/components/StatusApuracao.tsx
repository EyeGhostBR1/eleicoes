"use client";
// Barra de status da apuração: % de seções totalizadas, horário da última totalização,
// contagem regressiva da atualização automática e estado vazio (antes das 17h).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type HttpError, useParamsState } from "@/lib/client/hooks";
import { REFRESH_MS } from "@/lib/config";
import { fmtDataHora, fmtInt, fmtPct } from "@/lib/format";
import type { LiveResult } from "@/lib/types";
import { Badge, Card, ErroCarga, Skeleton } from "./ui";

/** Segundos até a próxima atualização automática (aproximado ao ciclo do SWR). */
export function useContagem(isValidating: boolean, intervalo: number): number | null {
  const ultimoRef = useRef<number | null>(null);
  const [resta, setResta] = useState<number | null>(null);
  useEffect(() => {
    if (!isValidating) ultimoRef.current = Date.now();
  }, [isValidating]);
  useEffect(() => {
    const tick = () => {
      const u = ultimoRef.current;
      setResta(u == null ? null : Math.max(0, Math.ceil((intervalo - (Date.now() - u)) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [intervalo]);
  return resta;
}

export function semDadosAinda(error: HttpError | undefined): boolean {
  return error?.status === 404;
}

export function EstadoVazio({ compacto }: { compacto?: boolean }) {
  const { turno, qs } = useParamsState();
  return (
    <Card className={compacto ? "p-4" : "p-5 sm:p-6"} role="status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-strong">
            {turno === 2 ? "Ainda não há resultados do 2º turno no TSE." : "A apuração ainda não começou."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {turno === 2
              ? "Os resultados aparecem aqui assim que o TSE iniciar a divulgação do 2º turno."
              : "O TSE divulga os resultados a partir das 17h (Brasília)."}{" "}
            Enquanto isso, veja abaixo os resultados de 2022 e 2018.
          </p>
        </div>
        {turno === 1 && (
          <Link
            href={`/exterior${qs}`}
            className="shrink-0 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-strong hover:bg-surface"
            title="Boletins de urna das seções no exterior já encerradas, publicados pelo TSE antes das 17h"
          >
            Ver votos do exterior →
          </Link>
        )}
      </div>
    </Card>
  );
}

export default function StatusApuracao({
  data,
  error,
  isLoading,
  isValidating,
  mutate,
}: {
  data: LiveResult | undefined;
  error: HttpError | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
}) {
  const resta = useContagem(isValidating, REFRESH_MS);

  if (!data) {
    if (semDadosAinda(error)) return <EstadoVazio />;
    if (error) return <ErroCarga msg={error.message} onRetry={mutate} />;
    return (
      <Card className="p-4" aria-busy="true" aria-label="Carregando status da apuração">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-3 h-3 w-40" />
      </Card>
    );
  }

  const t = data.totais;
  const pctT = Math.max(0, Math.min(100, t.pctTotalizado || 0));
  return (
    <Card className="p-4" aria-label="Status da apuração">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-strong">{fmtPct(t.pctTotalizado)}</span>
          <span className="text-sm text-muted">das seções totalizadas</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {data.finalizado ? (
            <Badge tom="ok">✓ Totalização finalizada</Badge>
          ) : (
            <Badge tom="neutro">
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pt opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-pt" />
              </span>
              Em apuração
            </Badge>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Seções totalizadas"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pctT * 100) / 100}
        aria-valuetext={`${fmtPct(t.pctTotalizado)} das seções totalizadas`}
      >
        <div className="h-full rounded-full bg-strong transition-[width] duration-700" style={{ width: `${pctT}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted sm:text-sm">
        <span>
          {fmtInt(t.secoesTotalizadas)} de {fmtInt(t.secoesTotal)} seções · Última totalização:{" "}
          <span className="font-medium text-fg">{fmtDataHora(data.atualizadoEm)}</span>
        </span>
        <span className="flex items-center gap-2" aria-live="off">
          {error && <span className="text-down">Falha na última atualização</span>}
          {data.finalizado ? null : isValidating ? (
            <span>Atualizando…</span>
          ) : resta != null ? (
            <span>Atualiza em {resta}s</span>
          ) : null}
          <button
            type="button"
            onClick={mutate}
            disabled={isValidating || isLoading}
            className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
          >
            Atualizar
          </button>
        </span>
      </div>
    </Card>
  );
}
