"use client";
// Wrappers finos sobre os hooks de src/lib/client/hooks.ts.
//
// Motivo: os hooks ao vivo usam `keepPreviousData` do SWR; quando o usuário troca de
// turno/ambiente e a nova chave falha (ex.: 404 antes da apuração), o SWR continua
// devolvendo os dados da chave ANTERIOR. Aqui descartamos respostas cujo turno/ambiente
// (e local) não batem com o que está na URL, para nunca exibir o 1º turno como se fosse o 2º.
import { useMemo } from "react";
import {
  type HttpError,
  useEstados,
  useExterior,
  useHistBr,
  useHistMun,
  useListaMunicipios,
  useLive,
  useMunicipiosLive,
  useParamsState,
} from "@/lib/client/hooks";
import type { MunicipioTuple } from "@/lib/types";

export interface Carga<T> {
  data: T | undefined;
  error: HttpError | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
}

function bate(a: unknown, b: string | number): boolean {
  return a == null || String(a).toLowerCase() === String(b).toLowerCase();
}

export function useLiveOk(uf: string | null, mun?: string | null) {
  const { turno, ambiente } = useParamsState();
  const r = useLive(uf, mun);
  const { data, error, isLoading, isValidating, mutate } = r;
  const ok =
    data && bate(data.turno, turno) && bate(data.ambiente, ambiente) && (!uf || bate(data.uf, uf)) && (!mun || bate(data.mun, mun))
      ? data
      : undefined;
  return {
    data: ok,
    // erro só é relevante se não houver dado válido para a chave atual ou se for da chave atual
    error,
    isLoading: isLoading || (!!data && !ok && isValidating),
    isValidating,
    mutate: () => void mutate(),
  };
}

export function useEstadosOk() {
  const { turno, ambiente } = useParamsState();
  const { data, error, isLoading, isValidating, mutate } = useEstados();
  const ok = data && bate(data.turno, turno) && bate(data.ambiente, ambiente) ? data : undefined;
  return { data: ok, error, isLoading: isLoading || (!!data && !ok && isValidating), isValidating, mutate: () => void mutate() };
}

export function useMunicipiosOk(uf: string | null) {
  const { turno, ambiente } = useParamsState();
  const { data, error, isLoading, isValidating, mutate } = useMunicipiosLive(uf);
  const ok =
    data && bate(data.turno, turno) && bate(data.ambiente, ambiente) && (!uf || bate(data.uf, uf)) ? data : undefined;
  return { data: ok, error, isLoading: isLoading || (!!data && !ok && isValidating), isValidating, mutate: () => void mutate() };
}

/** Boletins de urna do exterior (/api/exterior), descartando respostas de outro turno. */
export function useExteriorOk() {
  const { turno } = useParamsState();
  const { data, error, isLoading, isValidating, mutate } = useExterior();
  const ok = data && bate(data.turno, turno) ? data : undefined;
  return { data: ok, error, isLoading: isLoading || (!!data && !ok && isValidating), isValidating, mutate: () => void mutate() };
}

export { useHistBr, useHistMun, useListaMunicipios };

/** Índices da lista de municípios: por UF, por código TSE (uf:cd) e IBGE → TSE. */
export function useIndiceMunicipios() {
  const { data, error, isLoading } = useListaMunicipios();
  const idx = useMemo(() => {
    const porUf = new Map<string, MunicipioTuple[]>();
    const porCd = new Map<string, MunicipioTuple>();
    const ibgeParaCd = new Map<string, string>();
    for (const t of data ?? []) {
      const [cd, , uf, ibge] = t;
      let l = porUf.get(uf);
      if (!l) porUf.set(uf, (l = []));
      l.push(t);
      porCd.set(`${uf}:${cd}`, t);
      if (ibge) ibgeParaCd.set(String(ibge), cd);
    }
    return { porUf, porCd, ibgeParaCd };
  }, [data]);
  return { ...idx, carregado: !!data, error, isLoading };
}
