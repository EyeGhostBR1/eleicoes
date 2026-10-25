// Resultados do EXTERIOR a partir dos boletins de urna (BU) oficiais já recebidos pelo TSE.
// Lado servidor (usa node:fs para os nomes das cidades; o resto é fetch + TS puro).
//
// O TSE publica o BU de cada seção do exterior assim que ele é recebido — horas antes da
// totalização das 17h (Ásia/Oceania/Oriente Médio/Europa chegam de madrugada/manhã):
//   lista de seções  {base}/arquivo-urna/{pleito}/config/zz/zz-p{pleito6}-cs.json
//   status da seção  {base}/arquivo-urna/{pleito}/dados/zz/{mun}/{zona}/{secao}/p{pleito6}-zz-m{mun}-z{zona}-s{secao}-aux.json
//                    (404 enquanto não recebida)
//   BU binário       {base}/arquivo-urna/{pleito}/dados/zz/{mun}/{zona}/{secao}/{hash}/{arquivo -bu.dat}
//                    (imutável depois de publicado)
// Cada BU decodificado fica em memória (por instância); seções ainda não recebidas são
// reconsultadas no máximo a cada ~60 s e as já recebidas são revalidadas (só o aux) a cada ~10 min,
// com prioridade mais baixa, para pegar re-transmissões (hash novo) e BUs excluídos pelo TSE.
// Cada chamada tem orçamento de tempo (padrão 45 s): o que não der tempo de consultar conta como
// "não recebida" nesta resposta (veja `statsDaResposta(r).completo`).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BLOCOS, TSE_AMBIENTES } from "../config";
import type { ExtAgregado, ExtCidade, ExteriorResponse, ExtPais, MunicipioTuple, Turno } from "../types";
import { fetchTse, fetchTseBinario, mapLimit, TSE_MAX_CONCORRENCIA, TseFetchError, tseEmPausa } from "../tse/fetch";
import { destinacaoValida } from "../tse/normalize";
import { dataHoraBrasilia } from "../tse/parse";
import { getResultado } from "../tse/service";
import { codigoEleicao } from "../tse/urls";
import { decodeBU, type BUDecodificado } from "./bu";
import { paisDaCidade } from "./paises";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const AMB = TSE_AMBIENTES.oficial;
const BASE = `${AMB.base}/${AMB.ciclo}`;
const URL_ELE_C = `${AMB.base}/comum/config/ele-c.json`;
const UF_EXT = "zz";
/** Pleitos já conhecidos (verificados): 1º turno 2026 = 3220 (eleição 6257). */
const PLEITOS_CONHECIDOS: Partial<Record<Turno, string>> = { 1: "3220" };
/** Cargo Presidente no BU (codigoCargo → cargoConstitucional). */
const CARGO_PRESIDENTE_BU = 1;

const NUM_PT = BLOCOS.pt.numeros["2026"];
const NUM_BO = BLOCOS.bolso.numeros["2026"];

/** Orçamento de tempo padrão de uma chamada (a rota tem maxDuration = 60 s). */
export const EXTERIOR_PRAZO_MS = 45_000;
/** Seção não recebida (aux 404): reconsulta depois de… */
const RECHECAR_NAO_RECEBIDA_MS = 60_000;
/** aux diz "recebida" mas o .dat ainda não está no CDN: reconsulta depois de… */
const RECHECAR_BU_AUSENTE_MS = 20_000;
/** BU que não decodifica (mesmo hash): reconsulta o aux depois de… */
const RECHECAR_FALHA_DECODE_MS = 10 * 60_000;
/**
 * Seção já recebida: revalida o aux depois de… (re-transmissão publica um hash novo e o antigo
 * pode passar a "Excluído"; o BU de um hash é imutável, então basta comparar o hash).
 */
const RECHECAR_RECEBIDA_MS = 10 * 60_000;
/** Não inicia uma nova seção com menos que isto de prazo restante. */
const MIN_RESTANTE_MS = 1_500;

const TTL_CS_MS = 60 * 60_000;
const TTL_CS_AUSENTE_MS = 60_000;
const TTL_PLEITO_MS = 10 * 60_000;
const TTL_PLEITO_ERRO_MS = 60_000;
const TTL_CANDIDATOS_MS = 60 * 60_000;
const TTL_CANDIDATOS_FALHA_MS = 2 * 60_000;
const TTL_NOMES_FALHA_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Formatos brutos
// ---------------------------------------------------------------------------

interface RawCsSecao {
  ns: string;
  /** seção principal (esta é AGREGADA a ela: os votos estão no BU da principal) */
  nsp?: string;
  /** seções agregadas a esta */
  nsa?: string[];
}

/** zz-p{pleito6}-cs.json */
export interface RawConfigSecoes {
  dg?: string;
  hg?: string;
  cdp?: string;
  abr?: { cd: string; ds?: string; mu?: { cd: string; nm?: string; zon?: { cd: string; sec?: RawCsSecao[] }[] }[] }[];
  [k: string]: unknown;
}

interface RawAuxArquivo {
  nm?: string;
  tp?: string;
}

interface RawAuxHash {
  hash?: string;
  /** data/hora de recebimento (Brasília) */
  dr?: string;
  hr?: string;
  /** "Recebido", "Totalizado", ... */
  st?: string;
  arq?: RawAuxArquivo[];
  /** formato antigo (2022): só nomes */
  nmarq?: string[];
}

/** p{pleito6}-zz-m{mun}-z{zona}-s{secao}-aux.json */
export interface RawAuxSecao {
  dg?: string;
  hg?: string;
  st?: string;
  hashes?: RawAuxHash[];
  [k: string]: unknown;
}

interface RawEleC {
  pl?: { cd?: string; c?: string; e?: { cd?: string; t?: string }[] }[];
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

const p6 = (pleito: string) => pleito.padStart(6, "0");

export function urlConfigSecoesExterior(pleito: string): string {
  return `${BASE}/arquivo-urna/${pleito}/config/${UF_EXT}/${UF_EXT}-p${p6(pleito)}-cs.json`;
}

function dirSecao(pleito: string, mun: string, zona: string, secao: string): string {
  return `${BASE}/arquivo-urna/${pleito}/dados/${UF_EXT}/${mun}/${zona}/${secao}`;
}

export function urlAuxSecao(pleito: string, mun: string, zona: string, secao: string): string {
  return `${dirSecao(pleito, mun, zona, secao)}/p${p6(pleito)}-${UF_EXT}-m${mun}-z${zona}-s${secao}-aux.json`;
}

export function urlBuSecao(pleito: string, mun: string, zona: string, secao: string, hash: string, arquivo: string): string {
  return `${dirSecao(pleito, mun, zona, secao)}/${hash}/${arquivo}`;
}

// ---------------------------------------------------------------------------
// Pleito / eleição por turno
// ---------------------------------------------------------------------------

export interface PleitoExterior {
  turno: Turno;
  /** código do pleito (ex.: "3220") */
  pleito: string;
  /** código da eleição (ex.: "6257") */
  eleicao: string;
}

const pleitoCache = new Map<Turno, { exp: number; p: Promise<string | null> }>();

async function buscarPleitoNoEleC(eleicao: string): Promise<string | null> {
  const j = await fetchTse<RawEleC>(URL_ELE_C, { ttlMs: 0, timeoutMs: 10_000 });
  for (const pl of j?.pl ?? []) {
    if (pl.c && pl.c !== AMB.ciclo) continue;
    if (pl.cd && (pl.e ?? []).some((e) => e.cd === eleicao)) return pl.cd;
  }
  return null;
}

/**
 * Pleito/eleição do turno. 1º turno: 3220/6257 (fixo). 2º turno: procura no ele-c.json o pleito
 * da eleição 6258 (cache 10 min, inclusive "ainda não existe"). null = sem fonte ainda.
 */
export async function resolverPleito(turno: Turno): Promise<PleitoExterior | null> {
  const eleicao = codigoEleicao("oficial", turno);
  const conhecido = PLEITOS_CONHECIDOS[turno];
  if (conhecido) return { turno, pleito: conhecido, eleicao };
  const agora = Date.now();
  const c = pleitoCache.get(turno);
  let p: Promise<string | null>;
  if (c && c.exp > agora) {
    p = c.p;
  } else {
    p = buscarPleitoNoEleC(eleicao);
    const entrada = { exp: agora + TTL_PLEITO_MS, p };
    pleitoCache.set(turno, entrada);
    p.catch((e) => {
      console.warn(`[exterior] ele-c.json indisponível: ${(e as Error).message}`);
      entrada.exp = Date.now() + TTL_PLEITO_ERRO_MS;
    });
  }
  const pleito = await p.catch(() => null);
  return pleito ? { turno, pleito, eleicao } : null;
}

// ---------------------------------------------------------------------------
// Lista de seções (cs) — cache 1 h
// ---------------------------------------------------------------------------

export interface SecaoExterior {
  /** chave única "{pleito}:{mun}:{zona}:{secao}" */
  key: string;
  mun: string;
  zona: string;
  secao: string;
}

export interface CidadeCfgExterior {
  cd: string;
  /** nome como vem do TSE (maiúsculas) */
  nomeTse: string;
  /** seções NÃO agregadas (cada uma tem o seu BU) */
  secoes: SecaoExterior[];
}

const csCache = new Map<string, { exp: number; p: Promise<CidadeCfgExterior[] | null> }>();

/** Converte o cs.json em cidades → seções, pulando as seções agregadas (com `nsp`). */
export function parseConfigSecoes(j: RawConfigSecoes, pleito: string): CidadeCfgExterior[] {
  const out: CidadeCfgExterior[] = [];
  const abr = j.abr?.find((a) => (a.cd ?? "").toLowerCase() === UF_EXT) ?? j.abr?.[0];
  for (const m of abr?.mu ?? []) {
    if (!/^\d{1,5}$/.test(m.cd ?? "")) continue;
    const mun = m.cd.padStart(5, "0");
    const secoes: SecaoExterior[] = [];
    const vistos = new Set<string>();
    for (const z of m.zon ?? []) {
      if (!/^\d{1,4}$/.test(z.cd ?? "")) continue;
      const zona = z.cd.padStart(4, "0");
      for (const s of z.sec ?? []) {
        if (s.nsp) continue; // agregada: votos no BU da seção principal
        if (!/^\d{1,4}$/.test(s.ns ?? "")) continue;
        const secao = s.ns.padStart(4, "0");
        const key = `${pleito}:${mun}:${zona}:${secao}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        secoes.push({ key, mun, zona, secao });
      }
    }
    out.push({ cd: mun, nomeTse: (m.nm ?? mun).trim(), secoes });
  }
  return out;
}

async function getConfigSecoes(pleito: string): Promise<CidadeCfgExterior[] | null> {
  const agora = Date.now();
  const c = csCache.get(pleito);
  if (c && c.exp > agora) return c.p;
  const p = fetchTse<RawConfigSecoes>(urlConfigSecoesExterior(pleito), { ttlMs: 0, timeoutMs: 15_000 }).then((j) =>
    j?.abr ? parseConfigSecoes(j, pleito) : null,
  );
  csCache.set(pleito, { exp: Date.now() + TTL_CS_MS, p });
  try {
    const r = await p;
    if (!r) {
      const e = csCache.get(pleito);
      if (e?.p === p) e.exp = Date.now() + TTL_CS_AUSENTE_MS;
    }
    return r;
  } catch (e) {
    // falhou: volta à cópia anterior (se houver) e deixa a próxima chamada tentar de novo
    if (csCache.get(pleito)?.p === p) {
      if (c) csCache.set(pleito, { ...c, exp: Date.now() + 30_000 });
      else csCache.delete(pleito);
    }
    if (c) {
      const anterior = await c.p.catch(() => null);
      if (anterior) {
        console.warn(`[exterior] usando lista de seções anterior após erro: ${(e as Error).message}`);
        return anterior;
      }
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Estado por seção (memória da instância)
// ---------------------------------------------------------------------------

interface EstadoSecao {
  /** BU decodificado (imutável por hash) */
  bu?: BUDecodificado;
  /** hash do BU decodificado em `bu` */
  hash?: string;
  /** recebimento pelo TSE (ISO -03:00) */
  recebidoEm?: string | null;
  /** última consulta ao aux (ms); 0 = nunca */
  verificadoEm: number;
  /** não reconsultar antes de (ms) */
  proxima: number;
  /** hash cujo BU não decodificou */
  falhaHash?: string;
}

const estado = new Map<string, EstadoSecao>();

/** Limpa todo o estado em memória (testes). */
export function limparEstadoExterior() {
  estado.clear();
  csCache.clear();
  pleitoCache.clear();
  candidatosCache.clear();
  candidatosBons.clear();
  nomesCache = null;
  emCurso.clear();
}

const RE_HASH_ACEITO = /^(recebid|totalizad|processad|apurad)/i;
const RE_HASH_REJEITADO = /exclu|rejeit|cancel|anulad|substitu|inv[aá]lid|descart|erro/i;
const RE_ARQ_SEGURO = /^[\w.-]+$/;
const RE_HASH_SEGURO = /^[0-9A-Za-z_-]+$/;

function arquivoBUdoHash(h: RawAuxHash): string | null {
  const arq = h.arq ?? [];
  const nm =
    arq.find((a) => (a.tp ?? "").toLowerCase() === "bu")?.nm ??
    arq.find((a) => /-bu\.dat$/i.test(a.nm ?? ""))?.nm ??
    (h.nmarq ?? []).find((n) => /-bu\.dat$|\.bu$/i.test(n)) ??
    null;
  return nm && RE_ARQ_SEGURO.test(nm) ? nm : null;
}

/**
 * Escolhe o BU válido no aux: o ÚLTIMO hash com status "Recebido" (ou "Totalizado", após as 17h);
 * na falta, o último cujo status não indique exclusão/rejeição.
 */
export function escolherHash(aux: RawAuxSecao): { hash: string; arquivo: string; dr?: string; hr?: string; st: string } | null {
  const hs = (aux.hashes ?? [])
    .map((h) => ({ h, arquivo: arquivoBUdoHash(h) }))
    .filter((x): x is { h: RawAuxHash; arquivo: string } => !!x.arquivo && !!x.h.hash && RE_HASH_SEGURO.test(x.h.hash));
  const montar = (x: { h: RawAuxHash; arquivo: string }) => ({
    hash: x.h.hash!,
    arquivo: x.arquivo,
    dr: x.h.dr,
    hr: x.h.hr,
    st: x.h.st ?? "",
  });
  for (let i = hs.length - 1; i >= 0; i--) if (RE_HASH_ACEITO.test((hs[i].h.st ?? "").trim())) return montar(hs[i]);
  for (let i = hs.length - 1; i >= 0; i--) {
    const st = (hs[i].h.st ?? "").trim();
    if (!RE_HASH_REJEITADO.test(st)) {
      console.warn(`[exterior] aux com status de hash inesperado "${st}" — usando mesmo assim`);
      return montar(hs[i]);
    }
  }
  return null;
}

/**
 * recebida    = BU novo decodificado;
 * substituida = seção já tinha BU e o TSE publicou outro hash (re-transmissão), já decodificado;
 * mantida     = seção já recebida revalidada sem mudança (ou mudança ainda não aplicável);
 * removida    = o aux não tem mais nenhum hash aceito (ex.: todos "Excluído"): deixa de contar;
 * nao-recebida / falha (BU não decodifica) / pulada (sem tempo).
 */
type ResultadoVerificacao = "recebida" | "substituida" | "mantida" | "removida" | "nao-recebida" | "falha" | "pulada";

async function verificarSecao(s: SecaoExterior, ple: PleitoExterior, prazo: number): Promise<ResultadoVerificacao> {
  const st: EstadoSecao = estado.get(s.key) ?? { verificadoEm: 0, proxima: 0 };
  estado.set(s.key, st);
  const rotulo = `${s.mun}/${s.zona}/${s.secao}`;
  let resta = prazo - Date.now();
  if (resta < MIN_RESTANTE_MS) return "pulada";

  const aux = await fetchTse<RawAuxSecao>(urlAuxSecao(ple.pleito, s.mun, s.zona, s.secao), {
    ttlMs: 0,
    timeoutMs: Math.min(6_000, resta),
    retries: resta > 12_000 ? 1 : 0,
    staleOnErrorMs: 0,
  });
  const agora = Date.now();
  st.verificadoEm = agora;
  const esc = aux ? escolherHash(aux) : null;
  if (!esc) {
    if (st.bu) {
      if (aux) {
        // o aux existe mas nenhum hash é aceito (todos excluídos/rejeitados): o TSE retirou o BU
        console.warn(`[exterior] BU ${rotulo} (${(st.hash ?? "").slice(0, 12)}…) não consta mais como recebido — removido`);
        st.bu = undefined;
        st.hash = undefined;
        st.recebidoEm = undefined;
        st.proxima = agora + RECHECAR_NAO_RECEBIDA_MS;
        return "removida";
      }
      // aux 404 depois de já publicado = falha transitória do CDN: mantém o BU decodificado
      st.proxima = agora + RECHECAR_RECEBIDA_MS;
      return "mantida";
    }
    st.proxima = agora + RECHECAR_NAO_RECEBIDA_MS;
    return "nao-recebida";
  }
  if (st.bu && st.hash === esc.hash) {
    st.proxima = agora + RECHECAR_RECEBIDA_MS;
    return "mantida";
  }
  if (st.falhaHash === esc.hash) {
    // esse hash já falhou na decodificação: não baixa de novo (se havia BU anterior, segue com ele)
    st.proxima = agora + (st.bu ? RECHECAR_RECEBIDA_MS : RECHECAR_FALHA_DECODE_MS);
    return st.bu ? "mantida" : "falha";
  }

  resta = prazo - Date.now();
  if (resta < 1_000) {
    // hash novo, mas sem tempo para o BU: volta à fila já na próxima chamada
    st.proxima = 0;
    if (!st.bu) st.verificadoEm = 0; // nova recebida → topo da fila
    return "pulada";
  }
  const bytes = await fetchTseBinario(urlBuSecao(ple.pleito, s.mun, s.zona, s.secao, esc.hash, esc.arquivo), {
    timeoutMs: Math.min(8_000, resta),
    retries: resta > 12_000 ? 1 : 0,
  });
  if (!bytes) {
    // aux já lista o hash mas o .dat ainda não chegou ao CDN
    st.proxima = Date.now() + RECHECAR_BU_AUSENTE_MS;
    return st.bu ? "mantida" : "nao-recebida";
  }

  let bu: BUDecodificado | null = null;
  let motivo = `sem eleição ${ple.eleicao}/cargo presidente`;
  try {
    bu = decodeBU(bytes, Number(ple.eleicao), CARGO_PRESIDENTE_BU);
  } catch (e) {
    motivo = `inválido: ${(e as Error).message}`;
  }
  if (!bu) {
    // não conta como recebida (se já havia um BU anterior decodificado, ele continua valendo)
    console.error(`[exterior] BU ${rotulo} (${esc.hash.slice(0, 12)}…) ${motivo}`);
    st.falhaHash = esc.hash;
    st.proxima = Date.now() + (st.bu ? RECHECAR_RECEBIDA_MS : RECHECAR_FALHA_DECODE_MS);
    return "falha";
  }
  if (bu.mun && (bu.mun !== s.mun || bu.zona !== s.zona || bu.secao !== s.secao)) {
    console.warn(`[exterior] BU de ${rotulo} identifica ${bu.mun}/${bu.zona}/${bu.secao} — usando mesmo assim`);
  }
  const substituida = !!st.bu;
  if (substituida) console.warn(`[exterior] BU ${rotulo} re-transmitido: ${(st.hash ?? "").slice(0, 12)}… → ${esc.hash.slice(0, 12)}…`);
  st.bu = bu;
  st.hash = esc.hash;
  st.falhaHash = undefined;
  st.recebidoEm = dataHoraBrasilia(esc.dr, esc.hr) ?? dataHoraBrasilia(aux!.dg, aux!.hg);
  st.proxima = Date.now() + RECHECAR_RECEBIDA_MS;
  return substituida ? "substituida" : "recebida";
}

// ---------------------------------------------------------------------------
// Candidatos (nome/partido) — do arquivo unificado nacional oficial (cache 1 h)
// ---------------------------------------------------------------------------

interface InfoCandidatos {
  mapa: Record<string, { nome: string; partido: string }>;
  /** números com destinação ≠ "Válido" (anulados/sub judice): votos não entram em `validos` */
  naoValidos: Set<string>;
}

const SEM_CANDIDATOS: InfoCandidatos = { mapa: {}, naoValidos: new Set<string>() };
const candidatosCache = new Map<Turno, { exp: number; p: Promise<InfoCandidatos> }>();
/** última lista boa por turno (usada quando o TSE falha) */
const candidatosBons = new Map<Turno, InfoCandidatos>();

function getCandidatos(turno: Turno): Promise<InfoCandidatos> {
  const agora = Date.now();
  const c = candidatosCache.get(turno);
  if (c && c.exp > agora) return c.p;
  const entrada = { exp: agora + TTL_CANDIDATOS_MS, p: null as unknown as Promise<InfoCandidatos> };
  entrada.p = getResultado({ uf: "br", turno, ambiente: "oficial" }, { incluirVazio: true })
    .then((r) => {
      const mapa: InfoCandidatos["mapa"] = {};
      const naoValidos = new Set<string>();
      for (const cand of r?.candidatos ?? []) {
        if (!cand.n) continue;
        mapa[cand.n] = { nome: cand.nome, partido: cand.partido };
        if (!destinacaoValida(cand.destinacao)) naoValidos.add(cand.n);
      }
      if (!Object.keys(mapa).length) {
        entrada.exp = Date.now() + TTL_CANDIDATOS_FALHA_MS;
        return candidatosBons.get(turno) ?? SEM_CANDIDATOS;
      }
      const info = { mapa, naoValidos };
      candidatosBons.set(turno, info);
      return info;
    })
    .catch((e) => {
      console.warn(`[exterior] candidatos indisponíveis: ${(e as Error).message}`);
      entrada.exp = Date.now() + TTL_CANDIDATOS_FALHA_MS;
      return candidatosBons.get(turno) ?? SEM_CANDIDATOS;
    });
  candidatosCache.set(turno, entrada);
  return entrada.p;
}

// ---------------------------------------------------------------------------
// Nomes das cidades (public/data/municipios.json; fallback: Title Case do nome do TSE)
// ---------------------------------------------------------------------------

let nomesCache: { exp: number; p: Promise<Map<string, string>> } | null = null;

function getNomesCidades(): Promise<Map<string, string>> {
  if (nomesCache && nomesCache.exp > Date.now()) return nomesCache.p;
  const entrada = { exp: Number.POSITIVE_INFINITY, p: null as unknown as Promise<Map<string, string>> };
  entrada.p = readFile(path.join(process.cwd(), "public/data/municipios.json"), "utf8")
    .then((txt) => {
      const m = new Map<string, string>();
      for (const [cd, nome, uf] of JSON.parse(txt) as MunicipioTuple[]) if (uf === UF_EXT) m.set(cd, nome);
      return m;
    })
    .catch((e) => {
      console.warn(`[exterior] municipios.json indisponível (${(e as Error).message}); usando nomes do TSE`);
      entrada.exp = Date.now() + TTL_NOMES_FALHA_MS;
      return new Map<string, string>();
    });
  nomesCache = entrada;
  return entrada.p;
}

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "del", "la", "las", "los", "el", "y", "di", "du", "des", "of"]);

/** "CIUDAD DEL ESTE" → "Ciudad del Este". */
export function tituloCase(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-)/)
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join("");
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

function agregadoVazio(): ExtAgregado {
  return { secoesTotal: 0, secoesRecebidas: 0, aptos: 0, comparecimento: 0, validos: 0, brancos: 0, nulos: 0, votos: {}, pt: 0, bo: 0 };
}

/**
 * Soma um BU no agregado. Votos válidos = nominais (+ legenda) dos candidatos com destinação
 * "Válido" na lista oficial — a mesma definição de `v.vv` do TSE:
 *  - número que NÃO consta da lista oficial (candidatura indeferida/cancelada que ficou na urna,
 *    ex.: nº 28 em 2026) → voto anulado: soma em `nulos` e não aparece em `votos`;
 *  - candidato da lista com destinação anulada (sub judice) → fica em `votos` (como no resultado
 *    do TSE), mas soma em `nulos`, não em `validos`.
 * Sem lista de candidatos (TSE indisponível desde o início da instância), todos os nominais
 * contam como válidos. Assim validos + brancos + nulos = comparecimento sempre.
 */
function somarBU(a: ExtAgregado, bu: BUDecodificado, cand: InfoCandidatos) {
  const temLista = Object.keys(cand.mapa).length > 0;
  a.secoesRecebidas++;
  a.aptos += bu.aptos;
  a.comparecimento += bu.comparecimento;
  for (const [n, v] of Object.entries(bu.votos)) {
    if (temLista && !cand.mapa[n]) {
      a.nulos += v; // número fora da lista oficial → anulado
      continue;
    }
    a.votos[n] = (a.votos[n] ?? 0) + v;
    if (cand.naoValidos.has(n)) a.nulos += v;
    else a.validos += v;
  }
  a.validos += bu.legenda;
  a.brancos += bu.brancos;
  a.nulos += bu.nulos + bu.outros; // outros tipos (nulo por repetição etc.) = nulos
}

function somarAgregado(a: ExtAgregado, b: ExtAgregado) {
  a.secoesTotal += b.secoesTotal;
  a.secoesRecebidas += b.secoesRecebidas;
  a.aptos += b.aptos;
  a.comparecimento += b.comparecimento;
  a.validos += b.validos;
  a.brancos += b.brancos;
  a.nulos += b.nulos;
  for (const [n, v] of Object.entries(b.votos)) a.votos[n] = (a.votos[n] ?? 0) + v;
}

function fecharBlocos<T extends ExtAgregado>(a: T): T {
  a.pt = a.votos[NUM_PT] ?? 0;
  a.bo = a.votos[NUM_BO] ?? 0;
  return a;
}

/** Monta a resposta a partir do estado em memória (sem I/O). */
function montarResposta(
  turno: Turno,
  cidadesCfg: CidadeCfgExterior[],
  nomes: Map<string, string>,
  cand: InfoCandidatos,
): ExteriorResponse {
  const cidades: Record<string, ExtCidade> = {};
  const paises: Record<string, ExtPais> = {};
  const total = agregadoVazio();
  let ultimaRecepcao: string | null = null;

  for (const cfg of cidadesCfg) {
    const info = paisDaCidade(cfg.cd) ?? { pais: "Outros", iso2: "" };
    const cid: ExtCidade = { ...agregadoVazio(), cd: cfg.cd, nome: nomes.get(cfg.cd) ?? tituloCase(cfg.nomeTse), pais: info.pais };
    for (const s of cfg.secoes) {
      cid.secoesTotal++;
      const st = estado.get(s.key);
      if (!st?.bu) continue;
      somarBU(cid, st.bu, cand);
      if (st.recebidoEm && (!ultimaRecepcao || st.recebidoEm > ultimaRecepcao)) ultimaRecepcao = st.recebidoEm;
    }
    cidades[cfg.cd] = fecharBlocos(cid);
    const pais = (paises[info.pais] ??= { ...agregadoVazio(), pais: info.pais, iso2: info.iso2, cidades: [] });
    pais.cidades.push(cfg.cd);
    somarAgregado(pais, cid);
  }
  for (const p of Object.values(paises)) {
    fecharBlocos(p);
    somarAgregado(total, p);
  }
  fecharBlocos(total);

  return {
    turno,
    geradoEm: new Date().toISOString(),
    fonte: "boletins-de-urna",
    ultimaRecepcao,
    total,
    cidades,
    paises,
    candidatos: cand.mapa,
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export interface ExteriorOpts {
  /** orçamento de tempo total (ms) da chamada (padrão 45 s) */
  prazoMs?: number;
  /** consultas simultâneas de seções (padrão = limite global do TSE, máx. 24) */
  concorrencia?: number;
}

/** Estatísticas da última execução (diagnóstico / testes). */
export interface ExteriorStats {
  turno: Turno;
  pleito: string;
  secoes: number;
  aVerificar: number;
  /** seções da fila efetivamente consultadas (inclui as revalidadas) */
  verificadas: number;
  novasRecebidas: number;
  naoRecebidas: number;
  /** já recebidas, revalidadas sem mudança */
  revalidadas: number;
  /** BU trocado por re-transmissão (hash novo) */
  substituidas: number;
  /** BU retirado (nenhum hash aceito no aux) */
  removidas: number;
  falhas: number;
  erros: number;
  puladas: number;
  recebidasTotal: number;
  inconsistentes: number;
  ms: number;
  interrompidoPorPausa: boolean;
  /**
   * true quando TODA a fila desta chamada foi consultada sem erro (nada ficou de fora por prazo,
   * 429 ou falha de rede). false = resposta parcial (ex.: instância fria): a rota usa cache curto.
   */
  completo: boolean;
}

let ultimaStats: ExteriorStats | null = null;
export function getUltimaStatsExterior(): ExteriorStats | null {
  return ultimaStats;
}

const statsPorResposta = new WeakMap<ExteriorResponse, ExteriorStats>();
/** Estatísticas da execução que gerou esta resposta (sem corrida com outras chamadas). */
export function statsDaResposta(r: ExteriorResponse): ExteriorStats | null {
  return statsPorResposta.get(r) ?? null;
}

const emCurso = new Map<Turno, Promise<ExteriorResponse | null>>();

/** Resolve com `fallback` se `p` não terminar em `ms`. */
function comPrazo<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((r) => (timer = setTimeout(() => r(fallback), ms)))]).finally(() => clearTimeout(timer));
}

/**
 * Resultados do exterior a partir dos BUs oficiais já publicados.
 *  - null quando o turno ainda não tem fonte (pleito desconhecido ou lista de seções 404);
 *  - lança TseFetchError só se a lista de seções falhar sem cópia anterior;
 *  - falhas pontuais de seções nunca derrubam a resposta (contam como não recebidas).
 * Chamadas simultâneas do mesmo turno compartilham a mesma execução.
 */
export function getExterior(p: { turno: Turno }, opts: ExteriorOpts = {}): Promise<ExteriorResponse | null> {
  const atual = emCurso.get(p.turno);
  if (atual) return atual;
  const prom = executar(p.turno, opts).finally(() => {
    if (emCurso.get(p.turno) === prom) emCurso.delete(p.turno);
  });
  emCurso.set(p.turno, prom);
  return prom;
}

async function executar(turno: Turno, opts: ExteriorOpts): Promise<ExteriorResponse | null> {
  const inicio = Date.now();
  const prazo = inicio + (opts.prazoMs ?? EXTERIOR_PRAZO_MS);

  const ple = await resolverPleito(turno);
  if (!ple) return null;

  // em paralelo: candidatos e nomes (não bloqueiam as seções)
  const candP = getCandidatos(turno);
  const nomesP = getNomesCidades();

  const cidadesCfg = await getConfigSecoes(ple.pleito);
  if (!cidadesCfg) return null;
  const secoes = cidadesCfg.flatMap((c) => c.secoes);

  // fila (vencidas): 0 = nunca verificadas, 1 = ainda não recebidas, 2 = já recebidas (revalidação);
  // dentro de cada grupo, as verificadas há mais tempo primeiro
  const agora = Date.now();
  const grupo = (st: EstadoSecao | undefined) => (!st || st.verificadoEm === 0 ? 0 : st.bu ? 2 : 1);
  const fila = secoes
    .filter((s) => {
      const st = estado.get(s.key);
      return !st || st.proxima <= agora;
    })
    .map((s) => ({ s, st: estado.get(s.key) }))
    .sort((a, b) => grupo(a.st) - grupo(b.st) || (a.st?.verificadoEm ?? 0) - (b.st?.verificadoEm ?? 0))
    .map((x) => x.s);

  const stats: ExteriorStats = {
    turno,
    pleito: ple.pleito,
    secoes: secoes.length,
    aVerificar: fila.length,
    verificadas: 0,
    novasRecebidas: 0,
    naoRecebidas: 0,
    revalidadas: 0,
    substituidas: 0,
    removidas: 0,
    falhas: 0,
    erros: 0,
    puladas: 0,
    recebidasTotal: 0,
    inconsistentes: 0,
    ms: 0,
    interrompidoPorPausa: false,
    completo: false,
  };

  let parar = false;
  let primeiroErro: string | null = null;
  const conc = Math.max(1, Math.min(opts.concorrencia ?? TSE_MAX_CONCORRENCIA, 24));
  const trabalho = mapLimit(fila, conc, async (s) => {
    if (parar) {
      stats.puladas++;
      return;
    }
    if (prazo - Date.now() < MIN_RESTANTE_MS) {
      parar = true;
      stats.puladas++;
      return;
    }
    try {
      const r = await verificarSecao(s, ple, prazo);
      if (r === "pulada") stats.puladas++;
      else {
        stats.verificadas++;
        if (r === "recebida") stats.novasRecebidas++;
        else if (r === "nao-recebida") stats.naoRecebidas++;
        else if (r === "mantida") stats.revalidadas++;
        else if (r === "substituida") stats.substituidas++;
        else if (r === "removida") stats.removidas++;
        else stats.falhas++;
      }
    } catch (e) {
      stats.erros++;
      const st = estado.get(s.key);
      if (st) st.verificadoEm = Date.now(); // vai para o fim da fila; tenta de novo na próxima chamada
      if (!primeiroErro) primeiroErro = e instanceof Error ? e.message : String(e);
      if (e instanceof TseFetchError && (e.status === 429 || tseEmPausa())) {
        stats.interrompidoPorPausa = true;
        parar = true; // TSE limitando: não insiste nesta chamada
      }
    }
  });
  // rede de segurança: nunca passa muito do prazo, mesmo com requisições presas na fila do
  // limitador (o que terminar depois fica guardado para a próxima chamada)
  await comPrazo(trabalho, Math.max(0, prazo - Date.now()) + 2_000, undefined);
  parar = true;
  // retrato desta execução (requisições que terminarem depois do prazo não o alteram)
  const fim: ExteriorStats = { ...stats, completo: stats.verificadas === stats.aVerificar && stats.erros === 0 };

  const [cand, nomes] = await Promise.all([comPrazo(candP, 3_000, candidatosBons.get(turno) ?? SEM_CANDIDATOS), nomesP]);
  const resp = montarResposta(turno, cidadesCfg, nomes, cand);

  for (const s of secoes) {
    const bu = estado.get(s.key)?.bu;
    if (bu) {
      fim.recebidasTotal++;
      if (bu.inconsistente) fim.inconsistentes++;
    }
  }
  fim.ms = Date.now() - inicio;
  ultimaStats = fim;
  statsPorResposta.set(resp, fim);
  console.log(
    `[exterior] t${turno} p${ple.pleito}: ${fim.recebidasTotal}/${fim.secoes} seções com BU` +
      ` | verificadas ${fim.verificadas}/${fim.aVerificar} (+${fim.novasRecebidas} novas, ${fim.naoRecebidas} não recebidas,` +
      ` ${fim.revalidadas} revalidadas, ${fim.substituidas} substituídas, ${fim.removidas} removidas,` +
      ` ${fim.falhas} falhas, ${fim.erros} erros, ${fim.puladas} sem tempo)${fim.completo ? "" : " PARCIAL"} | ${fim.ms} ms` +
      (primeiroErro ? ` | 1º erro: ${primeiroErro}` : ""),
  );
  return resp;
}
