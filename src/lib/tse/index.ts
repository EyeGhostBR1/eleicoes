// API pública do módulo TSE ao vivo (uso exclusivo no servidor).
export { fetchTse, mapLimit, limparCacheTse, TseFetchError, type FetchTseOptions } from "./fetch";
export {
  normalizeUnificado,
  toMunRow,
  munRowVazia,
  isFinalizado,
  isNaoIniciado,
  destinacaoValida,
  mapearBlocosPorNomeNumero,
  mapeamentoParaFallback,
  aplicarFallbackBlocos,
  type NormalizeCtx,
  type MapeamentoBlocos,
} from "./normalize";
export {
  getResultado,
  getEstados,
  getMunicipios,
  getConfigMunicipios,
  getListaMunicipios,
  getMapeamentoNacional,
  UFS_VALIDAS,
  type ResultadoParams,
  type ResultadoOpts,
  type MunicipiosOpts,
  type MunicipioCfg,
} from "./service";
export { urlResultado, urlAcompanhamento, urlConfigMunicipios, codigoEleicao, eleicao6 } from "./urls";
export {
  parseParamsTse,
  jsonResposta,
  erroResposta,
  respostaDeErro,
  CACHE_FINAL,
  CACHE_LIVE,
  CACHE_MUNICIPIOS,
  CACHE_NAO_DIVULGADO,
  MSG_NAO_DIVULGADO,
  type ParamsTse,
} from "./http";
export type * from "./raw";
