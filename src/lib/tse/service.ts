// Serviço de resultados ao vivo do TSE (lado servidor, sem dependência de Next).
import { UFS } from "../config";
import type { Ambiente, EstadosResponse, LiveMunRow, LiveResult, MunicipiosResponse, Turno } from "../types";
import { fetchTse, mapLimit, TseFetchError } from "./fetch";
import {
  aplicarFallbackBlocos,
  blocosFaltando,
  isNaoIniciado,
  mapeamentoParaFallback,
  munRowVazia,
  normalizeUnificado,
  toMunRow,
  type MapeamentoBlocos,
} from "./normalize";
import { carimbo, int } from "./parse";
import type { RawAbrangenciaAcomp, RawAcompanhamento, RawConfigMunicipios, RawUnificado } from "./raw";
import { codigoEleicao, urlAcompanhamento, urlConfigMunicipios, urlResultado } from "./urls";

export interface ResultadoParams {
  /** "br" | sigla minúscula | "zz" */
  uf: string;
  /** código TSE do município (5 dígitos) */
  mun?: string;
  turno: Turno;
  ambiente: Ambiente;
}

export interface ResultadoOpts {
  /**
   * Antes das 17h o TSE já publica arquivos "placeholder" (tudo zerado, andamento "n").
   * Por padrão eles são tratados como "ainda não divulgado" (retorna null).
   * Com `incluirVazio: true` o resultado zerado (com a lista de candidatos) é retornado.
   */
  incluirVazio?: boolean;
}

/** Siglas aceitas em `uf` (inclui "br" e "zz"). */
export const UFS_VALIDAS: ReadonlySet<string> = new Set(["br", ...UFS.map((u) => u.sigla)]);

// ---------------------------------------------------------------------------
// Mapeamento nacional de blocos (fallback do ambiente simulado)
// ---------------------------------------------------------------------------

const MAPA_TTL_MS = 60_000;
const mapaNacionalCache = new Map<string, { exp: number; p: Promise<MapeamentoBlocos | null> }>();

/**
 * Mapeamento de blocos derivado do resultado NACIONAL (cache 60 s por ambiente/turno).
 * Os números escolhidos são aplicados igualmente a todas as UFs/municípios.
 */
export function getMapeamentoNacional(turno: Turno, ambiente: Ambiente, nacional?: LiveResult): Promise<MapeamentoBlocos | null> {
  const key = `${ambiente}:${turno}`;
  const agora = Date.now();
  if (nacional) {
    const p = Promise.resolve(mapeamentoParaFallback(nacional).mapa);
    mapaNacionalCache.set(key, { exp: agora + MAPA_TTL_MS, p });
    return p;
  }
  const c = mapaNacionalCache.get(key);
  if (c && c.exp > agora) return c.p;
  const p = (async () => {
    const j = await fetchTse<RawUnificado>(urlResultado(ambiente, turno, "br"));
    if (!j) return null;
    const r = normalizeUnificado(j, { escopo: "br", uf: "br", turno, ambiente, eleicao: codigoEleicao(ambiente, turno) });
    if (!r.candidatos.length) return null;
    return mapeamentoParaFallback(r).mapa;
  })();
  mapaNacionalCache.set(key, { exp: agora + MAPA_TTL_MS, p });
  // não guarda falhas no cache
  p.catch(() => {
    if (mapaNacionalCache.get(key)?.p === p) mapaNacionalCache.delete(key);
  });
  return p;
}

// ---------------------------------------------------------------------------
// Resultado de uma abrangência
// ---------------------------------------------------------------------------

/** Normaliza um JSON unificado já baixado, aplicando o fallback de blocos do simulado. */
async function montarResultado(j: RawUnificado, p: ResultadoParams, mapa?: MapeamentoBlocos | null): Promise<LiveResult> {
  const uf = p.uf.toLowerCase();
  const escopo: LiveResult["escopo"] = uf === "br" ? "br" : p.mun ? "mun" : "uf";
  const r = normalizeUnificado(j, {
    escopo,
    uf,
    mun: p.mun,
    turno: p.turno,
    ambiente: p.ambiente,
    eleicao: codigoEleicao(p.ambiente, p.turno),
  });
  if (p.ambiente === "simulado" && blocosFaltando(r).length && r.candidatos.length) {
    let m = mapa;
    if (m === undefined) {
      m =
        escopo === "br"
          ? await getMapeamentoNacional(p.turno, p.ambiente, r)
          : await getMapeamentoNacional(p.turno, p.ambiente).catch(() => null);
    }
    if (m) aplicarFallbackBlocos(r, m);
  }
  return r;
}

/**
 * Resultado ao vivo de Brasil / UF / exterior ("zz") / município.
 * Retorna null quando o TSE ainda não publicou dados (404 ou placeholder zerado).
 * Lança TseFetchError em outros erros.
 */
export async function getResultado(p: ResultadoParams, opts: ResultadoOpts = {}): Promise<LiveResult | null> {
  const uf = p.uf.toLowerCase();
  const j = await fetchTse<RawUnificado>(urlResultado(p.ambiente, p.turno, uf, p.mun));
  if (!j) return null;
  if (!opts.incluirVazio && isNaoIniciado(j)) return null;
  return montarResultado(j, { ...p, uf });
}

/**
 * Brasil + todas as UFs (inclui "zz"), em paralelo. UFs indisponíveis/falhas viram null.
 * Se o nacional E a maioria das UFs falharem com ERRO (não "ainda não publicado"), lança o
 * erro (→ 502 no-store): assim o cliente (SWR keepPreviousData) mantém os últimos números em vez
 * de receber um 200 "tudo null" que ainda ficaria 15 s no cache do CDN (ex.: bloqueio 429 do TSE).
 */
export async function getEstados(p: { turno: Turno; ambiente: Ambiente }): Promise<EstadosResponse> {
  const siglas = UFS.map((u) => u.sigla);
  // Tudo em paralelo (antes o nacional era aguardado primeiro: no pior caso — timeout + nova
  // tentativa no br e depois nas UFs — passava do maxDuration de 30 s). No simulado as UFs
  // obtêm o mapeamento de blocos via getMapeamentoNacional, que baixa o MESMO arquivo br
  // (fetchTse deduplica a requisição em voo), então o mapeamento continua consistente.
  const erros = new Map<string, unknown>();
  const [br, ...lista] = await Promise.all(
    ["br", ...siglas].map((uf) =>
      getResultado({ uf, turno: p.turno, ambiente: p.ambiente }).catch((e) => {
        console.error(`[tse] estados/${uf}`, e instanceof Error ? e.message : e);
        erros.set(uf, e);
        return null;
      }),
    ),
  );
  if (erros.has("br") && erros.size - 1 >= siglas.length / 2) throw erros.get("br");
  const ufs: Record<string, LiveResult | null> = {};
  siglas.forEach((uf, i) => (ufs[uf] = lista[i]));
  return { turno: p.turno, ambiente: p.ambiente, geradoEm: new Date().toISOString(), br, ufs };
}

// ---------------------------------------------------------------------------
// Configuração de municípios (mun-e{ele6}-cm.json, ~530 KB) — cache em memória
// ---------------------------------------------------------------------------

export interface MunicipioCfg {
  /** código TSE (5 dígitos) */
  cd: string;
  nome: string;
  /** código IBGE (7 dígitos) ou "" (exterior) */
  ibge: string;
  /** "s" = capital */
  capital: boolean;
}

const CONFIG_TTL_MS = 6 * 60 * 60_000;
const configCache = new Map<string, { exp: number; p: Promise<Record<string, MunicipioCfg[]>> }>();

async function baixarConfig(ambiente: Ambiente, turno: Turno): Promise<Record<string, MunicipioCfg[]>> {
  // a lista de municípios é a mesma nos dois turnos; se a do 2º turno ainda não existir, usa a do 1º
  let j = await fetchTse<RawConfigMunicipios>(urlConfigMunicipios(ambiente, turno), { ttlMs: 0, timeoutMs: 15_000 });
  if (!j && turno === 2) j = await fetchTse<RawConfigMunicipios>(urlConfigMunicipios(ambiente, 1), { ttlMs: 0, timeoutMs: 15_000 });
  if (!j?.abr) throw new TseFetchError("Configuração de municípios indisponível no TSE", urlConfigMunicipios(ambiente, turno), 404);
  const porUf: Record<string, MunicipioCfg[]> = {};
  for (const a of j.abr) {
    porUf[a.cd.toLowerCase()] = (a.mu ?? []).map((m) => ({
      cd: m.cd,
      nome: m.nm ?? m.cd,
      ibge: m.cdi ?? "",
      capital: m.c === "s",
    }));
  }
  return porUf;
}

/** Todas as UFs → municípios (cache 6 h por ambiente/turno). */
export function getConfigMunicipios(ambiente: Ambiente, turno: Turno): Promise<Record<string, MunicipioCfg[]>> {
  const key = `${ambiente}:${turno}`;
  const agora = Date.now();
  const c = configCache.get(key);
  if (c && c.exp > agora) return c.p;
  const p = baixarConfig(ambiente, turno);
  configCache.set(key, { exp: agora + CONFIG_TTL_MS, p });
  p.catch(() => {
    if (configCache.get(key)?.p === p) configCache.delete(key);
  });
  return p;
}

/** Municípios de uma UF segundo a configuração da eleição. */
export async function getListaMunicipios(ambiente: Ambiente, turno: Turno, uf: string): Promise<MunicipioCfg[]> {
  const cfg = await getConfigMunicipios(ambiente, turno);
  return cfg[uf.toLowerCase()] ?? [];
}

// ---------------------------------------------------------------------------
// Municípios de uma UF (linhas compactas)
// ---------------------------------------------------------------------------

/** Cache de linhas por município, invalidado pelo carimbo dt/ht da totalização (acompanhamento). */
const linhaCache = new Map<string, { carimbo: string; row: LiveMunRow }>();

export interface MunicipiosOpts {
  /** concorrência de downloads (padrão 32) */
  concorrencia?: number;
  /** orçamento de tempo total em ms (padrão 45 s); municípios não baixados a tempo vão para `falhas` */
  prazoMs?: number;
}

/**
 * Linhas compactas de todos os municípios de uma UF.
 *  - lê o acompanhamento da UF ({uf}-e{ele6}-ab.json) e NÃO baixa municípios com 0 seções
 *    totalizadas (linha zerada, pa = 0);
 *  - reaproveita a linha em memória quando o carimbo dt/ht do município não mudou;
 *  - baixa o restante com concorrência ~32. Falhas (≠ "ainda não publicado") vão para `falhas`;
 *  - lança (→ 502) se a maioria dos downloads falhar por erro (ver fim da função).
 */
export async function getMunicipios(
  p: { uf: string; turno: Turno; ambiente: Ambiente },
  opts: MunicipiosOpts = {},
): Promise<MunicipiosResponse> {
  const uf = p.uf.toLowerCase();
  const { turno, ambiente } = p;
  const inicio = Date.now();
  const prazo = inicio + (opts.prazoMs ?? 45_000);

  const [lista, acomp, mapa] = await Promise.all([
    getListaMunicipios(ambiente, turno, uf),
    // erro aqui (após novas tentativas e sem cópia recente) propaga → 502; NÃO baixamos os
    // ~850 municípios "às cegas" para não martelar o CDN do TSE (que já responde 429).
    fetchTse<RawAcompanhamento>(urlAcompanhamento(ambiente, turno, uf)),
    ambiente === "simulado" ? getMapeamentoNacional(turno, ambiente).catch(() => null) : Promise.resolve(null),
  ]);

  const progresso = new Map<string, RawAbrangenciaAcomp>();
  for (const a of acomp?.abr ?? []) if (a.cdabr) progresso.set(a.cdabr, a);
  // acomp === null → arquivo de acompanhamento ainda não publicado → nada a baixar
  const semDados = !acomp;
  // No simulado as linhas dependem do mapeamento nacional de blocos: ele entra na chave do cache
  // (se o top-2 nacional mudar, as linhas são refeitas) e, sem mapeamento (br indisponível),
  // as linhas (pt/bo = 0) NÃO são guardadas — senão ficariam zeradas até o carimbo mudar.
  const assinaturaMapa = ambiente === "simulado" ? `:${mapa?.pt ?? "-"}/${mapa?.bolso ?? "-"}` : "";
  const podeGuardar = ambiente !== "simulado" || !!mapa;

  const municipios: Record<string, LiveMunRow> = {};
  const falhas: string[] = [];
  const baixar: { cd: string; carimbo: string; ab?: RawAbrangenciaAcomp }[] = [];

  for (const m of lista) {
    const ab = progresso.get(m.cd);
    const vazia = munRowVazia(int(ab?.e?.te), int(ab?.e?.c));
    if (semDados) {
      municipios[m.cd] = vazia;
      continue;
    }
    if (ab && int(ab.s?.st) === 0 && (ab.and ?? "").toLowerCase() !== "f") {
      municipios[m.cd] = vazia;
      continue;
    }
    const cb = ab ? carimbo(ab.dt, ab.ht) : "";
    const cacheKey = `${ambiente}:${turno}:${uf}:${m.cd}${assinaturaMapa}`;
    const c = linhaCache.get(cacheKey);
    if (c && cb && c.carimbo && c.carimbo >= cb) {
      municipios[m.cd] = c.row;
      continue;
    }
    baixar.push({ cd: m.cd, carimbo: cb, ab });
  }

  let primeiroErro: unknown = null;
  let nErros = 0;
  await mapLimit(baixar, opts.concorrencia ?? 32, async ({ cd, carimbo: cbAb, ab }) => {
    const cacheKey = `${ambiente}:${turno}:${uf}:${cd}${assinaturaMapa}`;
    const antigo = linhaCache.get(cacheKey);
    const resta = prazo - Date.now();
    if (resta < 1_000) {
      if (antigo) municipios[cd] = antigo.row;
      else falhas.push(cd);
      return;
    }
    try {
      // ttlMs: 0 → sem cache de JSON (só dedup); o cache é o de linhas acima.
      // Timeout/novas tentativas limitados ao que resta do prazo (não estourar o maxDuration da rota).
      const j = await fetchTse<RawUnificado>(urlResultado(ambiente, turno, uf, cd), {
        ttlMs: 0,
        timeoutMs: Math.min(6_000, resta),
        retries: resta > 13_000 ? 1 : 0,
      });
      if (!j || isNaoIniciado(j)) {
        // acompanhamento diz que há seções totalizadas mas o arquivo veio vazio/404 (CDN
        // atrasado): mantém a última linha boa, se houver, em vez de zerar o município
        municipios[cd] = antigo?.row ?? munRowVazia(int(ab?.e?.te), int(ab?.e?.c));
        return;
      }
      const r = await montarResultado(j, { uf, mun: cd, turno, ambiente }, mapa);
      const row = toMunRow(r);
      municipios[cd] = row;
      // Carimbo guardado = o do PRÓPRIO arquivo baixado (dt/ht), não o máximo com o do
      // acompanhamento: o CDN do TSE tem max-age ~60 s por objeto, então o arquivo do município
      // pode chegar mais velho que o acompanhamento. Com o máximo, essa linha velha ficava
      // "atualizada" para sempre (até o carimbo do município mudar de novo — nunca, se já
      // finalizado). Com o carimbo do arquivo, a próxima chamada baixa de novo até alcançar.
      const cbArq = carimbo(j.dt, j.ht) || cbAb;
      if (podeGuardar) linhaCache.set(cacheKey, { carimbo: cbArq, row });
    } catch (e) {
      if (antigo) {
        municipios[cd] = antigo.row; // mantém a última linha conhecida
      } else {
        falhas.push(cd);
        nErros++;
        if (!primeiroErro) primeiroErro = e;
      }
    }
  });

  if (primeiroErro) {
    const msg = primeiroErro instanceof Error ? primeiroErro.message : String(primeiroErro);
    console.error(`[tse] municipios ${uf}: ${falhas.length} falha(s), ${nErros} por erro; 1º erro = ${msg}`);
    // Maioria dos downloads falhou por ERRO (ex.: bloqueio 429 do TSE) → 502 no-store, para o
    // cliente manter os dados anteriores em vez de um 200 sem esses municípios (que ficaria 45 s
    // no CDN). Falhas por prazo esgotado não contam: na 1ª carga é melhor devolver o parcial.
    if (nErros >= 5 && nErros * 2 >= baixar.length) throw primeiroErro;
  }
  falhas.sort();
  return { uf, turno, ambiente, geradoEm: new Date().toISOString(), municipios, falhas };
}

// ---------------------------------------------------------------------------
// Progresso da totalização por município ({uf}-e{ele6}-ab.json) — usado pela estimativa
// ---------------------------------------------------------------------------

/** Progresso da totalização por município de uma UF (a partir do {uf}-e{ele6}-ab.json). */
export interface AcompanhamentoUF {
  /** código TSE do município (5 dígitos) → fração de seções totalizadas (0–1) */
  fracoes: Record<string, number>;
  /** código TSE do município → total de seções (ts); permite conciliar com o resultado da UF */
  secoes: Record<string, number>;
}

/**
 * Progresso por município da UF, a partir do acompanhamento ({uf}-e{ele6}-ab.json; o MESMO
 * arquivo que getMunicipios lê → cache/dedup de fetchTse).
 *  - fracoes: st/ts, 1 quando o município está finalizado (and = "f"), 0 quando ts = 0;
 *  - secoes: ts de cada município (peso para conciliar com as seções do resultado da UF);
 *  - `null` quando o arquivo ainda não foi publicado (404);
 *  - lança TseFetchError em outros erros (após novas tentativas / sem cópia recente).
 */
export async function getAcompanhamentoUF(p: { uf: string; turno: Turno; ambiente: Ambiente }): Promise<AcompanhamentoUF | null> {
  const uf = p.uf.toLowerCase();
  const acomp = await fetchTse<RawAcompanhamento>(urlAcompanhamento(p.ambiente, p.turno, uf));
  if (!acomp) return null;
  const fracoes: Record<string, number> = {};
  const secoes: Record<string, number> = {};
  for (const a of acomp.abr ?? []) {
    const cd = a.cdabr;
    if (!cd || !/^\d{5}$/.test(cd)) continue;
    if (a.tpabr && a.tpabr.toLowerCase() !== "mun") continue;
    const ts = int(a.s?.ts);
    const st = int(a.s?.st);
    // finalizado = nada mais a apurar no município (mesmo se st < ts, p.ex. seções não instaladas)
    const f = (a.and ?? "").toLowerCase() === "f" ? 1 : ts > 0 ? st / ts : 0;
    fracoes[cd] = Math.max(0, Math.min(1, f));
    secoes[cd] = Math.max(0, ts);
  }
  return { fracoes, secoes };
}

/** Só as frações de getAcompanhamentoUF (código TSE → 0–1); `null` se ainda não publicado. */
export async function getProgressoUF(p: { uf: string; turno: Turno; ambiente: Ambiente }): Promise<Record<string, number> | null> {
  const a = await getAcompanhamentoUF(p);
  return a ? a.fracoes : null;
}
