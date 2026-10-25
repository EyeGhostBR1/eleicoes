// Mapeamento cidade do exterior (código TSE) → país. Isomórfico (servidor e navegador).
import { CIDADE_PAIS } from "./paises-data";
import type { HistByYear, HistMunFile, HistResult } from "../types";

export interface PaisInfo {
  /** nome do país em pt-BR, ex. "Japão" */
  pais: string;
  /** ISO 3166-1 alfa-2, ex. "JP" */
  iso2: string;
}

/** chave = código TSE da cidade (5 dígitos) */
export const PAIS_POR_CIDADE: Record<string, PaisInfo> = CIDADE_PAIS;

export function paisDaCidade(cd: string): PaisInfo | null {
  return PAIS_POR_CIDADE[cd] ?? null;
}

/** Códigos TSE das cidades de um país. */
export function cidadesDoPais(pais: string): string[] {
  return Object.keys(PAIS_POR_CIDADE).filter((cd) => PAIS_POR_CIDADE[cd].pais === pais);
}

/** Lista de países (pt-BR) ordenada. */
export function listaPaises(): string[] {
  return [...new Set(Object.values(PAIS_POR_CIDADE).map((p) => p.pais))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function somar(a: HistResult | undefined, b: HistResult): HistResult {
  if (!a) return { ...b };
  return {
    ap: a.ap + b.ap,
    comp: a.comp + b.comp,
    abst: a.abst + b.abst,
    vv: a.vv + b.vv,
    vb: a.vb + b.vb,
    vn: a.vn + b.vn,
    pt: a.pt + b.pt,
    bo: a.bo + b.bo,
  };
}

/** Soma o histórico (2018/2022) das cidades do exterior por país. */
export function histPorPais(histZz: HistMunFile | undefined | null): Record<string, HistByYear> {
  const out: Record<string, HistByYear> = {};
  if (!histZz) return out;
  for (const [cd, h] of Object.entries(histZz)) {
    const p = PAIS_POR_CIDADE[cd];
    if (!p) continue;
    const acc = (out[p.pais] ??= {});
    for (const ano of ["2018", "2022"] as const) {
      for (const t of ["1", "2"] as const) {
        const r = h[ano]?.[t];
        if (!r) continue;
        const porAno = (acc[ano] ??= {});
        porAno[t] = somar(porAno[t], r);
      }
    }
  }
  return out;
}
