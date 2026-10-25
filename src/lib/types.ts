// Contratos compartilhados entre API routes, scripts de dados e UI.
// NÃO altere nomes/campos sem atualizar todos os consumidores.

export type Turno = 1 | 2;
export type Ambiente = "oficial" | "simulado";

/**
 * Blocos comparados entre os anos:
 *  - "pt":    Lula (2026, 2022)  ==  Haddad (2018)
 *  - "bolso": Flávio Bolsonaro (2026)  ==  Jair Bolsonaro (2022, 2018)
 */
export type BlocoId = "pt" | "bolso";

/** Ano histórico usado como base de comparação. */
export type AnoHist = "2018" | "2022";

// ---------------------------------------------------------------------------
// Dados históricos (pré-processados a partir dos dados abertos do TSE)
// ---------------------------------------------------------------------------

/** Resultado FINAL de um lugar (Brasil, UF ou município) num ano/turno. */
export interface HistResult {
  /** eleitores aptos */
  ap: number;
  /** comparecimento */
  comp: number;
  /** abstenções */
  abst: number;
  /** votos válidos (soma dos votos nominais de todos os candidatos) */
  vv: number;
  /** votos brancos */
  vb: number;
  /** votos nulos */
  vn: number;
  /** votos do bloco PT (Lula 2022 / Haddad 2018) */
  pt: number;
  /** votos do bloco Bolsonaro (Jair 2022 / Jair 2018) */
  bo: number;
}

/** Resultados históricos de um lugar, por ano e turno. */
export type HistByYear = Partial<Record<AnoHist, Partial<Record<"1" | "2", HistResult>>>>;

/** public/data/hist/br.json */
export interface HistBrFile {
  br: HistByYear;
  /** chave = sigla da UF em minúsculas ("sp", "df", ..., "zz" = exterior) */
  ufs: Record<string, HistByYear>;
}

/** public/data/hist/mun/{uf}.json — chave = código TSE do município (5 dígitos, string com zeros à esquerda) */
export type HistMunFile = Record<string, HistByYear>;

/**
 * public/data/municipios.json — lista compacta de municípios da eleição 2026
 * (gerada a partir de mun-e006257-cm.json do TSE).
 * Cada item: [codigoTSE (5 dígitos), nome, uf (minúsculas), codigoIBGE (7 dígitos ou "")]
 */
export type MunicipioTuple = [cd: string, nome: string, uf: string, ibge: string];

// ---------------------------------------------------------------------------
// Resultados ao vivo (TSE 2026) — normalizados pelas rotas /api/tse/*
// ---------------------------------------------------------------------------

export interface LiveCandidate {
  /** número na urna, ex. "13" */
  n: string;
  /** nome de urna */
  nome: string;
  /** sigla do partido */
  partido: string;
  votos: number;
  /** % dos votos válidos (0–100) */
  pct: number;
  /** situação informada pelo TSE ("2º turno", "Eleito", "Não eleito", ...) */
  situacao?: string;
  eleito?: boolean;
  /** destinação do voto ("Válido", "Anulado", "Anulado sub judice"...) */
  destinacao?: string;
}

export interface LiveTotals {
  /** seções totalizadas / total */
  secoesTotal: number;
  secoesTotalizadas: number;
  /** % de seções totalizadas (0–100) */
  pctTotalizado: number;
  eleitorado: number;
  comparecimento: number;
  abstencao: number;
  /** % comparecimento sobre eleitorado apurado (0–100) */
  pctComparecimento: number;
  validos: number;
  brancos: number;
  nulos: number;
}

export interface LiveResult {
  escopo: "br" | "uf" | "mun";
  /** "br" para escopo br; sigla minúscula para UF/município */
  uf: string;
  /** código TSE do município (5 dígitos) quando escopo = "mun" */
  mun?: string;
  turno: Turno;
  ambiente: Ambiente;
  eleicao: string;
  /** ISO 8601 (com offset -03:00) da última totalização */
  atualizadoEm: string | null;
  /** true quando o TSE indicou totalização final (tf = "s") */
  finalizado: boolean;
  totais: LiveTotals;
  /** todos os candidatos, ordenados por votos desc */
  candidatos: LiveCandidate[];
  /** candidatos mapeados nos blocos de comparação */
  blocos: Partial<Record<BlocoId, LiveCandidate>>;
  /** true quando o mapeamento de blocos foi feito por fallback (ex.: ambiente simulado) */
  blocosPorFallback?: boolean;
}

/** Resposta de /api/tse/estados */
export interface EstadosResponse {
  turno: Turno;
  ambiente: Ambiente;
  geradoEm: string;
  br: LiveResult | null;
  /** chave = UF minúscula (inclui "zz" exterior). null quando indisponível. */
  ufs: Record<string, LiveResult | null>;
}

/** Linha compacta por município — /api/tse/municipios */
export interface LiveMunRow {
  /** % seções totalizadas */
  pa: number;
  /** votos válidos */
  vv: number;
  /** votos bloco PT */
  pt: number;
  /** votos bloco Bolsonaro */
  bo: number;
  /** comparecimento */
  comp: number;
  /** eleitorado */
  ap: number;
  /** número do candidato líder no município */
  lid?: string;
}

/** Resposta de /api/tse/municipios?uf=xx */
export interface MunicipiosResponse {
  uf: string;
  turno: Turno;
  ambiente: Ambiente;
  geradoEm: string;
  /** chave = código TSE (5 dígitos) */
  municipios: Record<string, LiveMunRow>;
  /** municípios que falharam ao carregar (404 ainda sem dados, timeout...) */
  falhas: string[];
}

// ---------------------------------------------------------------------------
// Boletins da imprensa — /api/boletins
// ---------------------------------------------------------------------------

export type FonteId =
  | "g1"
  | "cnn"
  | "terra"
  | "jovempan"
  | "uol"
  | "folha"
  | "estadao"
  | "band"
  | "r7"
  | "poder360"
  | "metropoles"
  | "outros";

export interface EscopoBoletim {
  /** "pais" = país estrangeiro (votos no exterior, uf = "zz") */
  tipo: "br" | "uf" | "mun" | "pais";
  /** UF minúscula quando tipo = uf|mun ("zz" para cidade/país no exterior) */
  uf?: string;
  /** código TSE quando tipo = mun */
  mun?: string;
  /** nome do país em pt-BR (como em src/lib/exterior/paises-data.ts) quando tipo = "pais" */
  pais?: string;
  /** nome legível (ex.: "Brasil", "São Paulo", "Campinas (SP)", "Japão (exterior)") */
  nome: string;
}

export interface NumerosBoletim {
  /** % de urnas/seções apuradas citado no boletim */
  pctApurado?: number;
  /** % de votos válidos do Lula citado */
  pt?: number;
  /** % de votos válidos do Flávio citado */
  bolso?: number;
  /** quem o boletim diz que venceu/lidera no escopo ("Lula vence na China" → "pt") */
  vencedor?: BlocoId;
  escopo?: EscopoBoletim;
}

export type TipoBoletim = "apuracao" | "boca-de-urna" | "pesquisa" | "outro";

export interface Boletim {
  id: string;
  /** classificação do conteúdo: boletim de apuração, boca de urna, pesquisa de intenção de voto, outro */
  tipo: TipoBoletim;
  fonte: FonteId;
  /** nome legível da fonte, ex. "g1 / Globo" */
  fonteNome: string;
  titulo: string;
  resumo?: string;
  url: string;
  /** ISO 8601 */
  publicadoEm: string | null;
  extraido: NumerosBoletim;
}

export interface BoletinsResponse {
  geradoEm: string;
  consulta: string;
  itens: Boletim[];
  /** fontes consultadas e status */
  fontes: { id: FonteId; nome: string; ok: boolean; itens: number; erro?: string }[];
}

// ---------------------------------------------------------------------------
// Exterior — boletins de urna (BU) oficiais já recebidos pelo TSE — /api/exterior
// ---------------------------------------------------------------------------

export interface ExtAgregado {
  secoesTotal: number;
  /** seções cujo boletim de urna já foi recebido/publicado */
  secoesRecebidas: number;
  /** eleitores aptos nas seções recebidas */
  aptos: number;
  comparecimento: number;
  /** votos válidos (nominais) */
  validos: number;
  brancos: number;
  nulos: number;
  /** votos por número de candidato */
  votos: Record<string, number>;
  /** votos do bloco PT (Lula, nº 13) */
  pt: number;
  /** votos do bloco Bolsonaro (Flávio, nº 22) */
  bo: number;
}

export interface ExtCidade extends ExtAgregado {
  /** código TSE da cidade no exterior (5 dígitos) */
  cd: string;
  nome: string;
  pais: string;
}

export interface ExtPais extends ExtAgregado {
  pais: string;
  iso2: string;
  /** códigos TSE das cidades do país */
  cidades: string[];
}

/** Resposta de /api/exterior?turno= */
export interface ExteriorResponse {
  turno: Turno;
  geradoEm: string;
  fonte: "boletins-de-urna";
  /** horário (ISO) do boletim recebido mais recente */
  ultimaRecepcao: string | null;
  total: ExtAgregado;
  /** chave = código TSE */
  cidades: Record<string, ExtCidade>;
  /** chave = nome do país (pt-BR) */
  paises: Record<string, ExtPais>;
  /** nome de urna e partido por número de candidato */
  candidatos: Record<string, { nome: string; partido: string }>;
}

// ---------------------------------------------------------------------------
// Estimativa do resultado final — /api/estimativa
// ---------------------------------------------------------------------------

export type CenarioId = "base2022" | "base2018" | "proporcional";

export interface EstimativaBloco {
  votos: number;
  /** % dos votos válidos estimados (0–100) */
  pct: number;
}

export interface EstimativaCenario {
  id: CenarioId;
  pt: EstimativaBloco;
  bolso: EstimativaBloco;
  outros: EstimativaBloco;
  /** votos válidos totais estimados (apurados + restantes) */
  validos: number;
}

export interface EstimativaLugar {
  /** "br", sigla minúscula ou "zz" */
  uf: string;
  /** % de seções totalizadas (0–100) */
  pctTotalizado: number;
  /** % dos válidos já apurados (null sem apuração) */
  parcial: { pt: number | null; bolso: number | null; validos: number };
  cenarios: Record<CenarioId, EstimativaCenario>;
  /** swing ajustado pela composição do apurado (p.p., 2026 − ano base), por bloco */
  swing: Record<"base2022" | "base2018", { pt: number | null; bolso: number | null }>;
  /** de onde veio o swing usado nas seções restantes */
  fonteSwing: "proprio" | "regiao" | "nacional" | "nenhum";
  /** votos válidos ainda por apurar (estimativa, cenário base2022) */
  validosRestantes: number;
  /** resultado final histórico do lugar (% dos válidos) */
  final2022: { pt: number | null; bolso: number | null };
  final2018: { pt: number | null; bolso: number | null };
}

export interface EstimativaResponse {
  turno: Turno;
  ambiente: Ambiente;
  geradoEm: string;
  /** horário da última totalização do TSE usada */
  atualizadoEm: string | null;
  /** false antes do início da apuração (nada totalizado) */
  disponivel: boolean;
  motivo?: string;
  /** estimativa principal = cenário base2022 */
  br: EstimativaLugar | null;
  ufs: Record<string, EstimativaLugar>;
  /** faixa nacional (% dos válidos) combinando os cenários e a margem histórica do backtest */
  intervalo: { pt: [number, number]; bolso: [number, number] } | null;
  /** margem histórica (p.p.) do modelo para o % apurado atual, medida no backtest */
  margemHistorica: number | null;
}

// ---------------------------------------------------------------------------
// Tempo de apuração — /api/tse/tempos (painel 1º × 2º turno)
// ---------------------------------------------------------------------------

/** Ritmo da apuração de um lugar (Brasil ou UF) a partir do acompanhamento do TSE. */
export interface TemposLugar {
  /** % de seções totalizadas agora */
  pa: number;
  munTotal: number;
  /** municípios com a apuração concluída */
  munConcluidos: number;
  /** eleitorado total (soma dos municípios) */
  eleitorado: number;
  /**
   * % do eleitorado em municípios com a apuração concluída, a cada `passoMin` minutos desde o
   * fechamento das urnas (índice 0 = fechamento). Termina na última conclusão (turno encerrado)
   * ou no momento da resposta (turno em andamento).
   */
  curva: number[];
  /** minutos após o fechamento em que o eleitorado em municípios concluídos atingiu 50%, 90% e 100% */
  m50: number | null;
  m90: number | null;
  m100: number | null;
  /** municípios concluídos sem horário utilizável (retotalizados muito depois): fora da curva */
  tardios: number;
}

export interface TemposMunicipio {
  /** minutos após o fechamento em que o município concluiu a apuração (null = não concluído / sem horário) */
  m: number | null;
  /** eleitorado */
  te: number;
  /** % de seções totalizadas */
  pa: number;
}

export interface TemposResponse {
  turno: Turno;
  geradoEm: string;
  /** fechamento das urnas (ISO, horário de Brasília) */
  fechamento: string;
  passoMin: number;
  /** minutos entre o fechamento e a geração da resposta */
  agoraMin: number;
  br: TemposLugar;
  /** chave = UF minúscula (sem o exterior) */
  ufs: Record<string, TemposLugar | null>;
  /** com ?uf=: tempo de cada município da UF (chave = código TSE) */
  municipios?: Record<string, TemposMunicipio>;
}

// ---------------------------------------------------------------------------
// Maiores cidades — /api/tse/cidades (painel 1º × 2º turno)
// ---------------------------------------------------------------------------

export interface CidadeResultado {
  cd: string;
  uf: string;
  nome: string;
  /** null = TSE ainda sem dados do município neste turno */
  r: {
    pa: number;
    vv: number;
    pt: number;
    bo: number;
    comp: number;
    /** eleitorado */
    ap: number;
    /** última totalização (ISO); num município concluído, o momento da conclusão */
    atualizadoEm: string | null;
    finalizado: boolean;
  } | null;
}

export interface CidadesResponse {
  turno: Turno;
  geradoEm: string;
  cidades: CidadeResultado[];
}
