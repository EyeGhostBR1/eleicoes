"use client";
// Hook de dados da aba "Estimativa": SWR em /api/estimativa?turno=<turno>, atualizando a cada 30 s.
// Descarta respostas de outro turno (keepPreviousData manteria o 1º turno ao trocar para o 2º).
import useSWR from "swr";
import { type HttpError, fetchJson, useParamsState } from "@/lib/client/hooks";
import { REFRESH_MS } from "@/lib/config";
import type { EstimativaResponse } from "@/lib/types";

// Igual ao liveOpts de src/lib/client/hooks.ts: com erro (ex.: falha do TSE), o SWR pararia o
// polling; este onErrorRetry tenta de novo a cada 30 s para a página voltar sozinha.
const opts = {
  refreshInterval: REFRESH_MS,
  revalidateOnFocus: true,
  keepPreviousData: true,
  shouldRetryOnError: true,
  onErrorRetry: (
    _err: unknown,
    _key: string,
    _config: unknown,
    revalidate: (opts: { retryCount: number }) => void,
    { retryCount }: { retryCount: number },
  ) => {
    setTimeout(() => revalidate({ retryCount }), REFRESH_MS);
  },
};

export function useEstimativa() {
  const { turno } = useParamsState();
  const r = useSWR<EstimativaResponse, HttpError>(`/api/estimativa?turno=${turno}`, fetchJson, opts);
  const { data, error, isLoading, isValidating, mutate } = r;
  const ok = data && Number(data.turno) === turno ? data : undefined;
  return {
    data: ok,
    error,
    isLoading: isLoading || (!!data && !ok && isValidating),
    isValidating,
    mutate: () => void mutate(),
    turno,
  };
}

export type EstimativaCarga = ReturnType<typeof useEstimativa>;
