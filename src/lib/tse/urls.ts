// Construtores de URL dos arquivos de divulgação do TSE (2026).
import { CARGO_PRESIDENTE, TSE_AMBIENTES } from "../config";
import type { Ambiente, Turno } from "../types";

/** Código da eleição (sem zeros), ex.: "6257". */
export function codigoEleicao(ambiente: Ambiente, turno: Turno): string {
  return TSE_AMBIENTES[ambiente].eleicao[turno];
}

/** Código da eleição com 6 dígitos, ex.: "006257". */
export function eleicao6(ambiente: Ambiente, turno: Turno): string {
  return codigoEleicao(ambiente, turno).padStart(6, "0");
}

/** {base}/{ciclo}/{ele} */
export function baseEleicao(ambiente: Ambiente, turno: Turno): string {
  const a = TSE_AMBIENTES[ambiente];
  return `${a.base}/${a.ciclo}/${codigoEleicao(ambiente, turno)}`;
}

/** Cargo com 4 dígitos ("0001" = Presidente). */
function cargo4(): string {
  return CARGO_PRESIDENTE.padStart(4, "0");
}

/**
 * Resultado "unificado" (candidatos + totais).
 * uf = "br" | sigla minúscula | "zz"; mun = código TSE de 5 dígitos (opcional).
 * Ex.: .../dados/sp/sp71072-c0001-e021270-u.json
 */
export function urlResultado(ambiente: Ambiente, turno: Turno, uf: string, mun?: string): string {
  const u = uf.toLowerCase();
  return `${baseEleicao(ambiente, turno)}/dados/${u}/${u}${mun ?? ""}-c${cargo4()}-e${eleicao6(ambiente, turno)}-u.json`;
}

/**
 * Acompanhamento (andamento da totalização):
 *  - uf = "br" → um item por UF (+ br);
 *  - uf = sigla → um item por município da UF.
 */
export function urlAcompanhamento(ambiente: Ambiente, turno: Turno, uf: string): string {
  const u = uf.toLowerCase();
  return `${baseEleicao(ambiente, turno)}/dados/${u}/${u}-e${eleicao6(ambiente, turno)}-ab.json`;
}

/** Configuração de municípios (todas as UFs) da eleição. */
export function urlConfigMunicipios(ambiente: Ambiente, turno: Turno): string {
  return `${baseEleicao(ambiente, turno)}/config/mun-e${eleicao6(ambiente, turno)}-cm.json`;
}
