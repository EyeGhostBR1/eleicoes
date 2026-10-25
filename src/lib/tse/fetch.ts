// Acesso HTTP ao CDN de resultados do TSE — SOMENTE no servidor.
// O CDN do TSE responde 403 quando recebe cabeçalho Origin de outro domínio,
// por isso nunca chamamos estas URLs a partir do navegador.
// O CDN (Akamai) também devolve 429 transitórios ("Error from child"); por isso
// 429 tem novas tentativas próprias e, em erro, servimos a última resposta boa (stale).

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export const TSE_TIMEOUT_MS = 8_000;
export const TSE_CACHE_TTL_MS = 10_000;
/** Por quanto tempo uma resposta boa pode ser servida quando o TSE falha. */
export const TSE_STALE_ON_ERROR_MS = 5 * 60_000;

/** Erro HTTP/rede ao consultar o TSE (404 NÃO gera erro: vira null). */
export class TseFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TseFetchError";
  }
}

export interface FetchTseOptions {
  /** TTL do cache em memória (ms). 0 = sem cache (mantém só a deduplicação de requisições em voo). */
  ttlMs?: number;
  /** Timeout por tentativa (ms). Padrão 8 s. */
  timeoutMs?: number;
  /** Novas tentativas em erro de rede/timeout/5xx (padrão 1). 429 tem 1 nova tentativa própria e, se persistir, pausa global de 20 s. */
  retries?: number;
  /** Idade máxima (ms) da última resposta boa servida quando o TSE falha (padrão 5 min; 0 = nunca). */
  staleOnErrorMs?: number;
}

interface CacheEntry {
  /** expiração do cache "fresco" */
  exp: number;
  /** instante do download */
  t: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_CACHE_ENTRIES = 400;

function guardar(url: string, e: CacheEntry) {
  cache.delete(url); // reinsere no fim (ordem de inserção = LRU aproximado)
  cache.set(url, e);
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const agora = Date.now();
  for (const [k, v] of cache) if (agora - v.t > TSE_STALE_ON_ERROR_MS) cache.delete(k);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Limitador global (por instância): o CDN do TSE bloqueia o IP por alguns minutos
// (HTTP 429 em TUDO) quando recebe rajadas grandes. Testado: ~700 req/s → bloqueio.
// ---------------------------------------------------------------------------

function envNum(nome: string, padrao: number): number {
  const v = Number(typeof process !== "undefined" ? process.env?.[nome] : undefined);
  return isFinite(v) && v > 0 ? v : padrao;
}

/** Requisições/s ao TSE por instância (token bucket). Env: TSE_MAX_RPS. */
export const TSE_MAX_RPS = envNum("TSE_MAX_RPS", 40);
/** Requisições simultâneas ao TSE por instância. Env: TSE_MAX_CONCORRENCIA. */
export const TSE_MAX_CONCORRENCIA = envNum("TSE_MAX_CONCORRENCIA", 24);
/** Pausa global após 429 persistente (ms): nesse intervalo não chamamos o TSE (falha rápido / stale). */
const PAUSA_429_MS = 20_000;

/**
 * Relógio MONOTÔNICO do limitador: com Date.now(), um ajuste do relógio do sistema para trás
 * (NTP) deixaria `tokens` muito negativo e travaria todas as chamadas ao TSE por esse tempo.
 */
const relogio = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

let tokens = TSE_MAX_RPS;
let ultimoReabastecimento = relogio();
let ativos = 0;
const fila: (() => void)[] = [];
let circuitoAbertoAte = 0;

function reabastecer() {
  const agora = relogio();
  tokens = Math.min(TSE_MAX_RPS, tokens + (Math.max(0, agora - ultimoReabastecimento) / 1000) * TSE_MAX_RPS);
  ultimoReabastecimento = agora;
}

let timerFila: ReturnType<typeof setTimeout> | null = null;
function processarFila() {
  timerFila = null;
  reabastecer();
  while (fila.length && ativos < TSE_MAX_CONCORRENCIA && tokens >= 1) {
    tokens -= 1;
    ativos++;
    fila.shift()!();
  }
  if (fila.length && !timerFila && ativos < TSE_MAX_CONCORRENCIA) {
    const espera = Math.max(5, Math.ceil(((1 - tokens) / TSE_MAX_RPS) * 1000));
    timerFila = setTimeout(processarFila, espera);
  }
}

function adquirir(): Promise<void> {
  return new Promise((resolve) => {
    fila.push(resolve);
    processarFila();
  });
}

function liberar() {
  ativos--;
  processarFila();
}

/** true enquanto o TSE estiver limitando este IP (após 429 persistente). */
export function tseEmPausa(): boolean {
  return relogio() < circuitoAbertoAte;
}

/** Formato esperado da resposta: JSON (padrão) ou binário (ex.: boletim de urna .dat). */
type TipoResposta = "json" | "bin";

async function tentativa(
  url: string,
  timeoutMs: number,
  tipo: TipoResposta = "json",
): Promise<{ status: number; data: unknown; retryAfter?: number }> {
  if (tseEmPausa()) return { status: 429, data: undefined };
  await adquirir();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      // sem Origin/Referer: o CDN do TSE bloqueia origens externas
      headers: { "User-Agent": USER_AGENT, Accept: tipo === "bin" ? "application/octet-stream, */*" : "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      const ra = Number(res.headers.get("retry-after"));
      // 404 = arquivo ainda não publicado (o bucket responde NoSuchKey)
      return { status: res.status, data: res.status === 404 ? null : undefined, retryAfter: isFinite(ra) ? ra : undefined };
    }
    if (tipo === "bin") {
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      // corpo vazio ou página de erro HTML/XML com 200 → erro transitório
      if (!buf.length || ct.includes("text/html") || ct.includes("xml")) return { status: 598, data: undefined };
      return { status: res.status, data: buf };
    }
    const texto = await res.text();
    try {
      return { status: res.status, data: JSON.parse(texto) };
    } catch {
      // resposta truncada/HTML → trata como erro transitório
      return { status: 598, data: undefined };
    }
  } finally {
    clearTimeout(timer);
    liberar();
  }
}

async function buscar(url: string, timeoutMs: number, retries: number, tipo: TipoResposta = "json"): Promise<unknown> {
  let erro: TseFetchError | null = null;
  let n429 = 0;
  let nOutros = 0;
  while (true) {
    let espera = 0;
    try {
      const { status, data, retryAfter } = await tentativa(url, timeoutMs, tipo);
      if (status === 404) return null;
      if (data !== undefined) return data;
      erro = new TseFetchError(
        status === 598
          ? tipo === "bin"
            ? "Resposta inválida (vazia/HTML) do TSE"
            : "Resposta inválida (não-JSON) do TSE"
          : `TSE respondeu HTTP ${status}`,
        url,
        status,
      );
      if (status === 429) {
        if (tseEmPausa()) {
          erro = new TseFetchError("TSE limitando requisições (HTTP 429); pausa temporária", url, 429);
          throw erro;
        }
        if (n429 >= 1) {
          // 429 persistente → abre o "circuito": ninguém chama o TSE por PAUSA_429_MS
          circuitoAbertoAte = relogio() + PAUSA_429_MS;
          console.warn(`[tse] 429 persistente — pausando chamadas ao TSE por ${PAUSA_429_MS / 1000}s`);
          throw erro;
        }
        n429++;
        espera = Math.min(3_000, retryAfter ? retryAfter * 1000 : 0) || 800 + Math.random() * 700;
      } else if (status >= 500 && nOutros < retries) {
        nOutros++;
        espera = 250 + Math.random() * 250;
      } else {
        throw erro;
      }
    } catch (e) {
      if (e instanceof TseFetchError) throw e;
      const err = e as Error;
      const msg = err?.name === "AbortError" ? `Tempo esgotado (${timeoutMs} ms)` : `Erro de rede: ${err?.message ?? e}`;
      erro = new TseFetchError(msg, url);
      if (nOutros >= retries) throw erro;
      nOutros++;
      espera = 250 + Math.random() * 250;
    }
    await sleep(espera);
  }
}

/**
 * GET de um JSON do TSE (lado servidor).
 *  - retorna `null` quando o arquivo ainda não existe (HTTP 404);
 *  - lança `TseFetchError` em outros erros (após novas tentativas: 1 em rede/timeout/5xx, 1 em 429),
 *    a menos que exista uma resposta boa com menos de `staleOnErrorMs` (aí devolve ela);
 *  - cache em memória por URL (padrão 10 s, inclusive para 404) + deduplicação de requisições em voo.
 */
export async function fetchTse<T = unknown>(url: string, opts: FetchTseOptions = {}): Promise<T | null> {
  const ttl = opts.ttlMs ?? TSE_CACHE_TTL_MS;
  const staleMs = opts.staleOnErrorMs ?? TSE_STALE_ON_ERROR_MS;
  const agora = Date.now();
  if (ttl > 0) {
    const c = cache.get(url);
    if (c && c.exp > agora) return c.data as T | null;
  }
  const emVoo = inflight.get(url);
  if (emVoo) return emVoo as Promise<T | null>;

  const p = buscar(url, opts.timeoutMs ?? TSE_TIMEOUT_MS, opts.retries ?? 1)
    .then((data) => {
      if (ttl > 0) {
        const t = Date.now();
        guardar(url, { exp: t + ttl, t, data });
      }
      return data;
    })
    .catch((e) => {
      const c = cache.get(url);
      if (staleMs > 0 && c && c.data != null && Date.now() - c.t <= staleMs) {
        console.warn(`[tse] servindo cópia de ${Math.round((Date.now() - c.t) / 1000)}s após erro: ${(e as Error).message} (${url})`);
        return c.data;
      }
      throw e;
    })
    .finally(() => {
      inflight.delete(url);
    });
  inflight.set(url, p);
  return p as Promise<T | null>;
}

export interface FetchTseBinarioOptions {
  /** Timeout por tentativa (ms). Padrão 8 s. */
  timeoutMs?: number;
  /** Novas tentativas em erro de rede/timeout/5xx (padrão 1). 429 segue a mesma regra de `fetchTse`. */
  retries?: number;
}

const inflightBin = new Map<string, Promise<Uint8Array | null>>();

/**
 * GET de um arquivo BINÁRIO do TSE (ex.: boletim de urna `*-bu.dat`), lado servidor.
 * Usa o MESMO limitador global (req/s + simultâneas), as mesmas novas tentativas e a mesma
 * pausa após 429 de `fetchTse`. Sem cache (quem chama guarda o resultado decodificado);
 * só deduplica requisições em voo.
 *  - `null` quando o arquivo não existe (HTTP 404);
 *  - lança `TseFetchError` nos demais erros.
 */
export function fetchTseBinario(url: string, opts: FetchTseBinarioOptions = {}): Promise<Uint8Array | null> {
  const emVoo = inflightBin.get(url);
  if (emVoo) return emVoo;
  const p = (buscar(url, opts.timeoutMs ?? TSE_TIMEOUT_MS, opts.retries ?? 1, "bin") as Promise<Uint8Array | null>).finally(() => {
    inflightBin.delete(url);
  });
  inflightBin.set(url, p);
  return p;
}

/** Limpa o cache em memória (útil em testes). */
export function limparCacheTse() {
  cache.clear();
}

/** Executa `fn` sobre `itens` com no máximo `limite` tarefas simultâneas. */
export async function mapLimit<T, R>(itens: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(itens.length);
  let prox = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (true) {
      const i = prox++;
      if (i >= itens.length) return;
      out[i] = await fn(itens[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
