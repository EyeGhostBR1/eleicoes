"use client";
// Hooks de dados do cliente (SWR). Todas as páginas usam estes hooks.
import useSWR from "swr";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import { REFRESH_MS, TURNOS_FINALIZADOS, TURNO_PADRAO } from "../config";
import type {
  Ambiente,
  BoletinsResponse,
  CidadesResponse,
  EstadosResponse,
  ExteriorResponse,
  HistBrFile,
  HistMunFile,
  LiveResult,
  MunicipioTuple,
  MunicipiosResponse,
  TemposResponse,
  Turno,
} from "../types";

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      if (j?.erro) msg = j.erro;
    } catch {}
    throw new HttpError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

/** Turno fica na URL (?turno=1|2; sem parâmetro = TURNO_PADRAO). Ambiente sempre OFICIAL do TSE. */
export function useParamsState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tp = sp.get("turno");
  const turno: Turno = tp === "1" ? 1 : tp === "2" ? 2 : TURNO_PADRAO;
  const ambiente: Ambiente = "oficial";

  const set = useCallback(
    (patch: { turno?: Turno; ambiente?: Ambiente }) => {
      const p = new URLSearchParams(sp.toString());
      if (patch.turno) patch.turno === TURNO_PADRAO ? p.delete("turno") : p.set("turno", String(patch.turno));
      p.delete("amb");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  /** Sufixo de query para manter turno/ambiente em links internos. */
  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (turno !== TURNO_PADRAO) p.set("turno", String(turno));
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [turno]);

  return { turno, ambiente, set, qs };
}

// O SWR só faz polling por refreshInterval enquanto não há erro guardado. Antes das 17h a API
// responde 404 ("ainda não divulgado"); sem este onErrorRetry a página pararia de atualizar e
// nunca mudaria sozinha para os resultados ao vivo.
const liveOpts = {
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
const staticOpts = { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false };

/** Resultado ao vivo: uf = "br" | sigla; mun = código TSE (opcional). */
export function useLive(uf: string | null, mun?: string | null) {
  const { turno, ambiente } = useParamsState();
  const key = uf
    ? `/api/tse/resultado?uf=${uf}${mun ? `&mun=${mun}` : ""}&turno=${turno}&amb=${ambiente}`
    : null;
  return useSWR<LiveResult, HttpError>(key, fetchJson, liveOpts);
}

export function useEstados() {
  const { turno, ambiente } = useParamsState();
  return useSWR<EstadosResponse, HttpError>(`/api/tse/estados?turno=${turno}&amb=${ambiente}`, fetchJson, liveOpts);
}

export function useMunicipiosLive(uf: string | null) {
  const { turno, ambiente } = useParamsState();
  return useSWR<MunicipiosResponse, HttpError>(
    uf ? `/api/tse/municipios?uf=${uf}&turno=${turno}&amb=${ambiente}` : null,
    fetchJson,
    { ...liveOpts, refreshInterval: 60_000 },
  );
}

// ---------------------------------------------------------------------------
// Turno explícito (independente da URL) — comparação 1º × 2º turno de 2026.
// Mesmo formato de chave dos hooks acima → o SWR reaproveita/deduplica quando o turno coincide.
// Turno já finalizado: sem polling (o resultado não muda mais), mas com novas tentativas em erro.
// ---------------------------------------------------------------------------
const finalOpts = {
  ...liveOpts,
  refreshInterval: 0,
  revalidateOnFocus: false,
  revalidateIfStale: false,
};
function optsTurno(turno: Turno, refreshMs: number = REFRESH_MS) {
  return TURNOS_FINALIZADOS.includes(turno) ? finalOpts : { ...liveOpts, refreshInterval: refreshMs };
}

/** Resultado (Brasil / UF / município) de um turno específico. */
export function useLiveTurno(uf: string | null, mun: string | null | undefined, turno: Turno) {
  const key = uf ? `/api/tse/resultado?uf=${uf}${mun ? `&mun=${mun}` : ""}&turno=${turno}&amb=oficial` : null;
  return useSWR<LiveResult, HttpError>(key, fetchJson, optsTurno(turno));
}

/** Brasil + todas as UFs de um turno específico. */
export function useEstadosTurno(turno: Turno | null) {
  return useSWR<EstadosResponse, HttpError>(
    turno ? `/api/tse/estados?turno=${turno}&amb=oficial` : null,
    fetchJson,
    optsTurno(turno ?? 2),
  );
}

/** Linhas por município de uma UF num turno específico. */
export function useMunicipiosTurno(uf: string | null, turno: Turno) {
  return useSWR<MunicipiosResponse, HttpError>(
    uf ? `/api/tse/municipios?uf=${uf}&turno=${turno}&amb=oficial` : null,
    fetchJson,
    optsTurno(turno, 60_000),
  );
}

/** Ritmo da apuração (Brasil, UFs e, com `uf`, os municípios da UF) de um turno. */
export function useTempos(turno: Turno, uf: string | null) {
  return useSWR<TemposResponse, HttpError>(
    `/api/tse/tempos?turno=${turno}&amb=oficial${uf ? `&uf=${uf}` : ""}`,
    fetchJson,
    optsTurno(turno, 60_000),
  );
}

/** Resultado e andamento das 50 maiores cidades num turno. */
export function useCidades(turno: Turno | null) {
  return useSWR<CidadesResponse, HttpError>(
    turno ? `/api/tse/cidades?turno=${turno}&amb=oficial` : null,
    fetchJson,
    optsTurno(turno ?? 2, 60_000),
  );
}

/** Boletins de urna do exterior de um turno específico. */
export function useExteriorTurno(turno: Turno | null) {
  return useSWR<ExteriorResponse, HttpError>(
    turno ? `/api/exterior?turno=${turno}` : null,
    fetchJson,
    optsTurno(turno ?? 2, 60_000),
  );
}

export function useHistBr() {
  return useSWR<HistBrFile, HttpError>("/data/hist/br.json", fetchJson, staticOpts);
}

export function useHistMun(uf: string | null) {
  return useSWR<HistMunFile, HttpError>(uf ? `/data/hist/mun/${uf}.json` : null, fetchJson, staticOpts);
}

export function useListaMunicipios() {
  return useSWR<MunicipioTuple[], HttpError>("/data/municipios.json", fetchJson, staticOpts);
}

export function useBoletins(q: string, fontes: string[]) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (fontes.length) params.set("fontes", fontes.join(","));
  return useSWR<BoletinsResponse, HttpError>(`/api/boletins?${params.toString()}`, fetchJson, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
}

/** Exterior: boletins de urna já recebidos, agregados por cidade e país. */
export function useExterior() {
  const { turno } = useParamsState();
  return useSWR<ExteriorResponse, HttpError>(`/api/exterior?turno=${turno}`, fetchJson, {
    ...liveOpts,
    refreshInterval: 60_000,
  });
}
