import type { Ambiente, BlocoId, Turno } from "./types";

/** Endereços dos ambientes de divulgação do TSE (2026). */
export const TSE_AMBIENTES: Record<
  Ambiente,
  { base: string; ciclo: string; eleicao: Record<Turno, string>; rotulo: string }
> = {
  oficial: {
    base: "https://resultados.tse.jus.br/oficial",
    ciclo: "ele2026",
    eleicao: { 1: "6257", 2: "6258" },
    rotulo: "Oficial (TSE)",
  },
  // Ambiente de simulação público do TSE — útil para testar antes da apuração.
  simulado: {
    base: "https://resultados-sim.tse.jus.br/simulado/simulado2026",
    ciclo: "ele2026",
    eleicao: { 1: "21270", 2: "21271" },
    rotulo: "Simulado (TSE)",
  },
};

/** Cargo Presidente no TSE. */
export const CARGO_PRESIDENTE = "1";

/** Link para a página oficial de resultados (para referência na UI). */
export const TSE_APP_URL =
  "https://resultados.tse.jus.br/oficial/app/index.html#/eleicao/6257/uf/br/cargo/1/vis/nominal/resultados";

export const BLOCOS: Record<
  BlocoId,
  {
    rotulo: string;
    cor: string;
    corSuave: string;
    /** nome do candidato do bloco por ano */
    nomes: Record<"2026" | "2022" | "2018", string>;
    /** número na urna por ano (referência; o mapeamento ao vivo usa nome e depois número) */
    numeros: Record<"2026" | "2022" | "2018", string>;
  }
> = {
  pt: {
    rotulo: "Lula / Haddad",
    cor: "#d62828",
    corSuave: "#fde2e2",
    nomes: { "2026": "Lula", "2022": "Lula", "2018": "Haddad" },
    numeros: { "2026": "13", "2022": "13", "2018": "13" },
  },
  bolso: {
    rotulo: "Flávio / Jair",
    cor: "#1d4ed8",
    corSuave: "#dbe5ff",
    nomes: { "2026": "Flávio Bolsonaro", "2022": "Jair Bolsonaro", "2018": "Jair Bolsonaro" },
    numeros: { "2026": "22", "2022": "22", "2018": "17" },
  },
};

export const COR_OUTROS = "#9ca3af";

export interface UFInfo {
  sigla: string; // minúscula
  nome: string;
  regiao: "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul" | "Exterior";
  /** código IBGE da UF (2 dígitos) */
  ibge: string;
}

export const UFS: UFInfo[] = [
  { sigla: "ac", nome: "Acre", regiao: "Norte", ibge: "12" },
  { sigla: "al", nome: "Alagoas", regiao: "Nordeste", ibge: "27" },
  { sigla: "ap", nome: "Amapá", regiao: "Norte", ibge: "16" },
  { sigla: "am", nome: "Amazonas", regiao: "Norte", ibge: "13" },
  { sigla: "ba", nome: "Bahia", regiao: "Nordeste", ibge: "29" },
  { sigla: "ce", nome: "Ceará", regiao: "Nordeste", ibge: "23" },
  { sigla: "df", nome: "Distrito Federal", regiao: "Centro-Oeste", ibge: "53" },
  { sigla: "es", nome: "Espírito Santo", regiao: "Sudeste", ibge: "32" },
  { sigla: "go", nome: "Goiás", regiao: "Centro-Oeste", ibge: "52" },
  { sigla: "ma", nome: "Maranhão", regiao: "Nordeste", ibge: "21" },
  { sigla: "mt", nome: "Mato Grosso", regiao: "Centro-Oeste", ibge: "51" },
  { sigla: "ms", nome: "Mato Grosso do Sul", regiao: "Centro-Oeste", ibge: "50" },
  { sigla: "mg", nome: "Minas Gerais", regiao: "Sudeste", ibge: "31" },
  { sigla: "pa", nome: "Pará", regiao: "Norte", ibge: "15" },
  { sigla: "pb", nome: "Paraíba", regiao: "Nordeste", ibge: "25" },
  { sigla: "pr", nome: "Paraná", regiao: "Sul", ibge: "41" },
  { sigla: "pe", nome: "Pernambuco", regiao: "Nordeste", ibge: "26" },
  { sigla: "pi", nome: "Piauí", regiao: "Nordeste", ibge: "22" },
  { sigla: "rj", nome: "Rio de Janeiro", regiao: "Sudeste", ibge: "33" },
  { sigla: "rn", nome: "Rio Grande do Norte", regiao: "Nordeste", ibge: "24" },
  { sigla: "rs", nome: "Rio Grande do Sul", regiao: "Sul", ibge: "43" },
  { sigla: "ro", nome: "Rondônia", regiao: "Norte", ibge: "11" },
  { sigla: "rr", nome: "Roraima", regiao: "Norte", ibge: "14" },
  { sigla: "sc", nome: "Santa Catarina", regiao: "Sul", ibge: "42" },
  { sigla: "sp", nome: "São Paulo", regiao: "Sudeste", ibge: "35" },
  { sigla: "se", nome: "Sergipe", regiao: "Nordeste", ibge: "28" },
  { sigla: "to", nome: "Tocantins", regiao: "Norte", ibge: "17" },
  { sigla: "zz", nome: "Exterior", regiao: "Exterior", ibge: "" },
];

export const UF_POR_SIGLA: Record<string, UFInfo> = Object.fromEntries(UFS.map((u) => [u.sigla, u]));

/** Intervalo de atualização automática no cliente (ms). O TSE usa cache de ~30s. */
export const REFRESH_MS = 30_000;

/**
 * Turno exibido quando a URL não diz ?turno=. Em 25/10/2026 (dia do 2º turno) passou a ser 2;
 * o 1º turno continua acessível pelo seletor (?turno=1).
 */
export const TURNO_PADRAO: Turno = 2;

/**
 * Turnos de 2026 já totalizados por completo (o 1º turno, em 04/10/2026). Usado para cache longo
 * e para não fazer polling desses dados na comparação 1º × 2º turno.
 */
export const TURNOS_FINALIZADOS: Turno[] = [1];
