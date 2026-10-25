// Tipos (parciais e tolerantes) dos JSONs publicados pelo TSE (divulgação 2026).
// Todos os números chegam como string; percentuais usam vírgula decimal ("7,53").
// Variantes terminadas em "n" têm alta precisão (ex.: "pvapn": "7,527528669").

export interface RawSecoes {
  /** total de seções */
  ts?: string;
  /** seções totalizadas */
  st?: string;
  pst?: string;
  pstn?: string;
  [k: string]: unknown;
}

export interface RawEleitorado {
  /** eleitorado total */
  te?: string;
  /** eleitorado das seções totalizadas */
  est?: string;
  /** comparecimento */
  c?: string;
  pc?: string;
  pcn?: string;
  /** abstenção */
  a?: string;
  [k: string]: unknown;
}

export interface RawVotos {
  /** total de votos */
  tv?: string;
  /** votos válidos */
  vv?: string;
  /** votos brancos */
  vb?: string;
  /** total de votos nulos */
  tvn?: string;
  [k: string]: unknown;
}

export interface RawCandidato {
  n?: string;
  sqcand?: string;
  nm?: string;
  nmu?: string;
  /** destinação do voto */
  dvt?: string;
  seq?: string;
  /** "s"/"n" — eleito (ou classificado p/ 2º turno) */
  e?: string;
  /** situação ("2º turno", "Eleito", "Não eleito", "") */
  st?: string;
  /** votos apurados */
  vap?: string;
  pvap?: string;
  pvapn?: string;
  [k: string]: unknown;
}

export interface RawPartido {
  n?: string;
  sg?: string;
  nm?: string;
  cand?: RawCandidato[];
  [k: string]: unknown;
}

export interface RawAgremiacao {
  n?: string;
  nm?: string;
  tp?: string;
  par?: RawPartido[];
  [k: string]: unknown;
}

export interface RawCargo {
  cd?: string;
  agr?: RawAgremiacao[];
  [k: string]: unknown;
}

/** Arquivo "unificado" de resultado: {uf}{cdmun?}-c0001-e{ele6}-u.json */
export interface RawUnificado {
  ele?: string;
  t?: string;
  /** fase: "o" oficial, "s" simulado */
  f?: string;
  tpabr?: string;
  cdabr?: string;
  /** data/hora de geração do arquivo */
  dg?: string;
  hg?: string;
  /** data/hora da última totalização */
  dt?: string;
  ht?: string;
  dv?: string;
  tf?: string;
  /** andamento da totalização: "n" não iniciada, "f" finalizada (demais = em andamento) */
  and?: string;
  s?: RawSecoes;
  e?: RawEleitorado;
  v?: RawVotos;
  carg?: RawCargo[];
  [k: string]: unknown;
}

/** Item de acompanhamento ({uf}-e{ele6}-ab.json / br-e{ele6}-ab.json) */
export interface RawAbrangenciaAcomp {
  and?: string;
  tpabr?: string;
  cdabr?: string;
  dt?: string;
  ht?: string;
  s?: RawSecoes;
  e?: RawEleitorado;
  [k: string]: unknown;
}

export interface RawAcompanhamento {
  ele?: string;
  t?: string;
  f?: string;
  dg?: string;
  hg?: string;
  abr?: RawAbrangenciaAcomp[];
  [k: string]: unknown;
}

/** mun-e{ele6}-cm.json */
export interface RawConfigMunicipios {
  dg?: string;
  hg?: string;
  f?: string;
  abr?: {
    cd: string;
    ds?: string;
    mu?: { cd: string; cdi?: string; nm?: string; c?: string; z?: string[] }[];
  }[];
  [k: string]: unknown;
}
