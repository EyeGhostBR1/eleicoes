// Agregador de boletins da imprensa (SERVIDOR: usa fs e fetch sem CORS).
// Feeds RSS próprios dos veículos + Google Notícias (busca por site).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import type { Boletim, BoletinsResponse, EscopoBoletim, FonteId, MunicipioTuple, NumerosBoletim, TipoBoletim } from "../types";
import { classificarBoletim, normalizarBusca, parseBoletim } from "./parse";
import { listaPaises } from "../exterior/paises";
import {
  CONSULTAS_EXTERIOR,
  FONTE_OUTROS,
  FONTES,
  TODAS_FONTE_IDS,
  consultaGoogle,
  consultaGoogleExterior,
  fontePorUrl,
  googleNewsUrl,
  limparConsulta,
  nomeFonte,
} from "./sources";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 6000;
const TTL_FEED_MS = 45_000;
const IDADE_MAX_MS = 36 * 3600_000;
const LIMITE_PADRAO = 120;

// ---------------------------------------------------------------------------
// Texto: entidades HTML, tags
// ---------------------------------------------------------------------------

const ENT_NOMEADAS: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  middot: "·",
  bull: "•",
  percnt: "%",
  szlig: "ß",
};
const MARCAS: Record<string, string> = {
  acute: "́",
  grave: "̀",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  cedil: "̧",
};

export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : m;
      } catch {
        return m;
      }
    }
    if (ENT_NOMEADAS[e] !== undefined) return ENT_NOMEADAS[e];
    if (ENT_NOMEADAS[e.toLowerCase()] !== undefined) return ENT_NOMEADAS[e.toLowerCase()];
    const ac = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(e);
    if (ac) return (ac[1] + MARCAS[ac[2].toLowerCase()]).normalize("NFC");
    return m;
  });
}

export function limparHtml(s: string): string {
  const semTags = decodificarEntidades(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodificarEntidades(semTags).replace(/\s+/g, " ").trim();
}

function texto(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return texto(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return texto(o["#text"]);
    if ("@_href" in o) return texto(o["@_href"]);
  }
  return "";
}

/** Hash FNV-1a 32 bits (hex) — id estável e isomórfico. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function chaveTitulo(t: string): string {
  return normalizarBusca(t).replace(/[^a-z0-9]+/g, "").slice(0, 140);
}

// ---------------------------------------------------------------------------
// Datas (RFC 822 em inglês ou português, ISO)
// ---------------------------------------------------------------------------

const MESES_PT: Record<string, string> = {
  jan: "Jan",
  fev: "Feb",
  mar: "Mar",
  abr: "Apr",
  mai: "May",
  jun: "Jun",
  jul: "Jul",
  ago: "Aug",
  set: "Sep",
  out: "Oct",
  nov: "Nov",
  dez: "Dec",
};

export function parseData(s: string | undefined | null, agora = Date.now()): string | null {
  if (!s) return null;
  let t = s.trim();
  let d = new Date(t);
  if (isNaN(d.getTime())) {
    t = t
      .replace(/^(?:dom|seg|ter|qua|qui|sex|s[áa]b)[a-zçá-]*,?\s*/i, "")
      .replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?=\s|$)/i, (m, k: string) => MESES_PT[k.toLowerCase()] ?? m);
    d = new Date(t);
  }
  if (isNaN(d.getTime())) return null;
  let ms = d.getTime();
  // alguns feeds (ex.: home do UOL) publicam horário UTC com offset -0300 → "no futuro"
  if (ms > agora + 10 * 60_000) {
    const ajustado = ms - 3 * 3600_000;
    ms = ajustado <= agora + 10 * 60_000 ? ajustado : agora;
  }
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// HTTP com cache curto em memória
// ---------------------------------------------------------------------------

const cacheFeeds = new Map<string, { em: number; p: Promise<string> }>();

function charsetDe(contentType: string | null, bytes: Uint8Array): string {
  const h = /charset=["']?([\w-]+)/i.exec(contentType ?? "");
  if (h) return h[1].toLowerCase();
  const cab = new TextDecoder("ascii").decode(bytes.subarray(0, 200));
  const x = /encoding=["']([\w-]+)["']/i.exec(cab);
  return x ? x[1].toLowerCase() : "utf-8";
}

async function baixar(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let cs = charsetDe(res.headers.get("content-type"), bytes);
  if (cs === "utf8") cs = "utf-8";
  let txt: string;
  try {
    txt = new TextDecoder(cs).decode(bytes);
  } catch {
    txt = new TextDecoder("utf-8").decode(bytes);
  }
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(txt.slice(0, 3000))) throw new Error("resposta não é RSS/Atom");
  return txt;
}

function baixarComCache(url: string, timeoutMs: number): Promise<string> {
  const agora = Date.now();
  const c = cacheFeeds.get(url);
  if (c && agora - c.em < TTL_FEED_MS) return c.p;
  const p = baixar(url, timeoutMs);
  cacheFeeds.set(url, { em: agora, p });
  p.catch(() => {
    if (cacheFeeds.get(url)?.p === p) cacheFeeds.delete(url);
  });
  if (cacheFeeds.size > 300) {
    for (const [k, v] of cacheFeeds) if (agora - v.em >= TTL_FEED_MS) cacheFeeds.delete(k);
  }
  return p;
}

function msgErro(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "tempo esgotado";
    return e.message || e.name;
  }
  return String(e);
}

// ---------------------------------------------------------------------------
// RSS → itens brutos
// ---------------------------------------------------------------------------

interface ItemBruto {
  titulo: string;
  resumo: string;
  url: string;
  publicadoEm: string | null;
  /** nome/URL da fonte informados pelo Google Notícias */
  fonteNomeGoogle?: string;
  fonteUrlGoogle?: string;
  viaGoogle: boolean;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (nome) => nome === "item" || nome === "entry",
});

function linkDe(v: unknown): string {
  if (Array.isArray(v)) {
    const alt = v.find((l) => typeof l === "object" && l && ((l as Record<string, unknown>)["@_rel"] ?? "alternate") === "alternate");
    return linkDe(alt ?? v[0]);
  }
  return decodificarEntidades(texto(v)).trim();
}

function urlReal(u: string): string {
  // Folha: https://redir.folha.com.br/redir/online/poder/rss091/*https://www1.folha.uol.com.br/...
  const i = u.indexOf("*http");
  if (i >= 0) return u.slice(i + 1);
  return u;
}

export function lerRss(xml: string, viaGoogle: boolean): ItemBruto[] {
  const doc = parser.parse(xml) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const itens: Record<string, unknown>[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? doc?.["rdf:RDF"]?.item ?? [];
  const agora = Date.now();
  const out: ItemBruto[] = [];
  for (const it of itens) {
    let titulo = limparHtml(texto(it.title));
    const descRaw = texto(it.description) || texto(it.summary) || texto(it["content:encoded"]) || texto(it.content);
    let resumo = viaGoogle ? "" : limparHtml(descRaw);
    const url = urlReal(linkDe(it.link) || texto(it.guid));
    const publicadoEm = parseData(
      texto(it.pubDate) || texto(it["dc:date"]) || texto(it.published) || texto(it.updated),
      agora,
    );
    let fonteNomeGoogle: string | undefined;
    let fonteUrlGoogle: string | undefined;
    if (viaGoogle) {
      const src = it.source as Record<string, unknown> | string | undefined;
      fonteNomeGoogle = limparHtml(texto(src)) || undefined;
      fonteUrlGoogle = typeof src === "object" && src ? texto(src["@_url"]) : undefined;
      // "Manchete - Nome do Veículo"
      if (fonteNomeGoogle && titulo.endsWith(" - " + fonteNomeGoogle)) {
        titulo = titulo.slice(0, -(" - " + fonteNomeGoogle).length).trim();
      } else {
        titulo = titulo.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
      }
      // "Sampi Campinas: Flávio vota no Rio" — nome do veículo como prefixo (atrapalha a busca por lugar)
      if (fonteNomeGoogle && titulo.length > fonteNomeGoogle.length + 12 && titulo.toLowerCase().startsWith(fonteNomeGoogle.toLowerCase())) {
        const resto = titulo.slice(fonteNomeGoogle.length);
        if (/^\s*[:|]\s+|^\s+[-–]\s+/.test(resto)) titulo = resto.replace(/^\s*[:|\-–]\s*/, "").trim();
      }
    }
    // home do UOL: título é só um "chapéu" (ex. "RADAR DA ELEIÇÃO") e a manchete vem no resumo
    if (resumo && resumo.length <= 220 && (!titulo || (titulo === titulo.toUpperCase() && titulo.split(/\s+/).length <= 5))) {
      titulo = resumo;
      resumo = "";
    }
    if (!titulo || !url) continue;
    if (resumo && normalizarBusca(resumo).startsWith(normalizarBusca(titulo))) {
      resumo = resumo.slice(titulo.length).trim();
    }
    if (resumo.length > 320) resumo = resumo.slice(0, 317).replace(/\s+\S*$/, "") + "…";
    out.push({ titulo, resumo, url, publicadoEm, fonteNomeGoogle, fonteUrlGoogle, viaGoogle });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Municípios (para escopo por cidade)
// ---------------------------------------------------------------------------

let municipiosCache: { em: number; lista: MunicipioTuple[] } | null = null;

async function carregarMunicipios(origem?: string): Promise<MunicipioTuple[]> {
  const agora = Date.now();
  if (municipiosCache && (municipiosCache.lista.length > 0 || agora - municipiosCache.em < 5 * 60_000)) {
    return municipiosCache.lista;
  }
  let lista: MunicipioTuple[] = [];
  try {
    const raw = await readFile(path.join(process.cwd(), "public/data/municipios.json"), "utf8");
    lista = JSON.parse(raw) as MunicipioTuple[];
  } catch {
    // em produção os arquivos de /public podem não estar no bundle da função → tenta via HTTP
    if (origem) {
      try {
        const res = await fetch(`${origem}/data/municipios.json`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) lista = (await res.json()) as MunicipioTuple[];
      } catch {
        /* sem municípios: escopo fica em Brasil/UF */
      }
    }
  }
  if (!Array.isArray(lista)) lista = [];
  municipiosCache = { em: agora, lista };
  return lista;
}

// ---------------------------------------------------------------------------
// Relevância e montagem
// ---------------------------------------------------------------------------

const RE_FORTE = /\b(?:lula|flavio|bolsonaro|apuracao|apurad[oa]s?|totaliza(?:cao|d[oa]s?)|boca de urna|boletins? de urna)\b/;
/** "Eleições no exterior: veja resultados por país", "Primeiros boletins do exterior…" */
const RE_EXTERIOR_ELEICAO =
  /\b(?:(?:eleic(?:ao|oes)|votacao|voto|votos|apuracao|resultados?|boletins?|urnas?|secoes)\s+(?:d[oa]s?\s+)?(?:\w+\s+)?(?:no|do)\s+exterior|eleitores\s+(?:\w+\s+){0,2}(?:no|do)\s+exterior|brasileiros\s+(?:que\s+)?(?:vot\w+|elege\w*|escolhe\w*)\s+(?:\w+\s+){0,2}(?:no|do)\s+exterior)\b/;
const RE_PRESID = /\bpresiden(?:te|cia|cial|ciais|ciavel|ciaveis)\b/;
const RE_ELEICAO = /\b(?:eleic(?:ao|oes)|eleitora(?:l|is)|turno|votos?|urnas?|candidat[oa]s?|tse)\b/;

const RE_OUTROS_CARGOS =
  /\b(?:governador(?:a|es)?|governo (?:d[oae]s?|estadual)|senado|senador(?:a|es)?|deputad[oa]s?|assembleia|prefeit[oa]s?|vice-governador)\b/;
const RE_PRESID_TITULO = /\b(?:presiden\w*|lula|flavio|bolsonaro|planalto)\b/;

/** Item ligado à disputa presidencial de 2026 (título + resumo normalizados; título separado opcional). */
export function relevante(textoNorm: string, tituloNorm?: string): boolean {
  // manchete sobre outro cargo (governador, senado…) sem menção à Presidência → fora
  if (tituloNorm && RE_OUTROS_CARGOS.test(tituloNorm) && !RE_PRESID_TITULO.test(tituloNorm)) return false;
  // "Flávio Dino" (STF), "Flávio Roscoe"… não são o candidato
  const t = textoNorm.replace(/\bflavio (?:dino|roscoe|arns|tavares|cunha|nogueira)\b/g, " ");
  if (RE_FORTE.test(t)) return true;
  if (RE_EXTERIOR_ELEICAO.test(t)) return true;
  return RE_PRESID.test(t) && RE_ELEICAO.test(t);
}

const NOMES_PAISES_NORM = new Set(listaPaises().map((p) => normalizarBusca(p)));

/** A consulta livre é sobre o exterior ("exterior", um país ou uma cidade do exterior)? */
export function consultaExterior(q: string, municipios: MunicipioTuple[] = []): boolean {
  const qn = normalizarBusca(q);
  if (!qn) return false;
  if (/\bexterior\b/.test(qn) || NOMES_PAISES_NORM.has(qn)) return true;
  const esc = parseBoletim(`Lula vence em ${q}`, municipios).escopo;
  return esc?.uf === "zz";
}

const STOP_Q = new Set(["de", "da", "do", "das", "dos", "em", "no", "na", "e", "a", "o", "os", "as", "para", "com"]);

/**
 * O item casa com a consulta livre quando todas as palavras aparecem (início de palavra, sem acento)
 * no título/resumo, ou quando a consulta é o lugar detectado (ex.: "SP" → escopo São Paulo).
 */
export function casaConsulta(textoNorm: string, q: string, escopo?: NumerosBoletim["escopo"]): boolean {
  const qn = normalizarBusca(q);
  if (!qn) return true;
  if (escopo && escopo.tipo !== "br") {
    const nomeEsc = normalizarBusca(escopo.nome);
    if (nomeEsc === qn || nomeEsc.startsWith(qn + " (") || (escopo.tipo === "uf" && escopo.uf === qn)) return true;
    // exterior: "exterior" casa qualquer país/cidade do exterior; "Japão" casa "Tóquio (Japão)"
    if (escopo.uf === "zz" && (qn === "exterior" || nomeEsc.endsWith(`(${qn})`))) return true;
    if (escopo.tipo === "pais" && escopo.pais && normalizarBusca(escopo.pais) === qn) return true;
  }
  const toks = qn.split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP_Q.has(t));
  // início de palavra; siglas/termos curtos ("SP", "RJ", "BH") exigem a palavra inteira (evita "sp" → "sport")
  return toks.every((t) => new RegExp(`(?:^|[^a-z0-9])${t}${t.length <= 3 ? "(?![a-z0-9])" : ""}`).test(textoNorm));
}

function mesmoEscopo(a: EscopoBoletim | undefined, b: EscopoBoletim | undefined): boolean {
  if (!a || !b || a.tipo !== b.tipo) return false;
  return a.tipo === "br" || (a.uf === b.uf && a.mun === b.mun && a.pais === b.pais);
}

export function extrair(titulo: string, resumo: string, municipios: MunicipioTuple[]): { tipo: TipoBoletim; extraido: NumerosBoletim } {
  // tipo pela manchete; o resumo só decide quando traz números (evita "pesquisa" por menção solta no resumo)
  const tipoTitulo = classificarBoletim(titulo);
  const tipo =
    tipoTitulo !== "outro" || !resumo || !/\d\s?%/.test(resumo) ? tipoTitulo : classificarBoletim(`${titulo}. ${resumo}`);
  const t = parseBoletim(titulo, municipios);
  if (!resumo) return { tipo, extraido: t };
  const f = parseBoletim(`${titulo}. ${resumo}`, municipios);
  const r = parseBoletim(resumo, municipios);
  const temNum = (x: NumerosBoletim) => x.pctApurado !== undefined || x.pt !== undefined || x.bolso !== undefined;
  const numerosSoNoResumo = !temNum(t) && (temNum(f) || temNum(r));
  // números só no resumo → o escopo é o do resumo ("Datafolha… lidera em SP, RJ e DF" + resumo "no Piauí: Lula, 66%…";
  // "Lula vence na China" + "Flávio… venceu no Japão com 73%"); se o resumo não cita lugar, vale o da manchete
  // ("Apuração em Campinas" + "Lula tem 41%…")
  let escResumo: EscopoBoletim | undefined;
  if (numerosSoNoResumo) {
    escResumo = r.escopo;
    if (escResumo?.tipo === "br") escResumo = undefined;
  }
  // com lugar próprio no resumo, os números são os do resumo (os de manchete+resumo só se forem do mesmo lugar)
  const num = (k: "pctApurado" | "pt" | "bolso") =>
    t[k] ?? (escResumo ? (r[k] ?? (mesmoEscopo(f.escopo, escResumo) ? f[k] : undefined)) : f[k]);
  const extraido: NumerosBoletim = { pctApurado: num("pctApurado"), pt: num("pt"), bolso: num("bolso") };
  extraido.escopo = escResumo ?? t.escopo ?? f.escopo;
  // vencedor: o da manchete (ligado ao escopo da manchete); números só no resumo → o do resumo
  let vencedor = escResumo ? r.vencedor : t.vencedor;
  if (!escResumo && !vencedor && f.vencedor && mesmoEscopo(f.escopo, extraido.escopo)) vencedor = f.vencedor;
  // manchete genérica sem candidato ("Eleições no exterior: veja os resultados") + resumo com "Lula vence na China"
  if (
    !escResumo &&
    !/\b(?:lula|flavio|bolsonaro)\b/.test(normalizarBusca(titulo)) &&
    !vencedor &&
    f.vencedor &&
    t.pt === undefined &&
    t.bolso === undefined &&
    f.escopo &&
    f.escopo.uf === "zz" &&
    (extraido.escopo?.tipo === "br" || (extraido.escopo?.tipo === "uf" && extraido.escopo.uf === "zz"))
  ) {
    extraido.escopo = f.escopo;
    vencedor = f.vencedor;
  }
  if (vencedor) extraido.vencedor = vencedor;
  for (const k of ["pctApurado", "pt", "bolso"] as const) if (extraido[k] === undefined) delete extraido[k];
  return { tipo, extraido };
}

// ---------------------------------------------------------------------------
// Painel de apuração do g1 (JSON público servido pelo CDN da Globo)
//   https://s.glbimg.com/jo/el/2026/apuracao/{1|2}-turno/mapa/PRESIDENTE_BRASIL.JSON
//   { atualizacao:{hora,data,turno,apuracao_total,encerrado}, total:{c:[{nc,tc,tp,v}]},
//     municipios:{ <IBGE 7 dígitos>: { nm, ua, c:[…] } } }
// ---------------------------------------------------------------------------

export const PAINEL_G1_URL = (turno: 1 | 2) =>
  `https://s.glbimg.com/jo/el/2026/apuracao/${turno}-turno/mapa/PRESIDENTE_BRASIL.JSON`;
export const PAINEL_G1_PAGINA = "https://g1.globo.com/politica/eleicoes/2026/apuracao/presidente.ghtml";

interface G1Cand {
  nc?: string;
  tc?: string;
  tp?: string;
  v?: string;
}
interface G1Bloco {
  nm?: string;
  ua?: string;
  c?: G1Cand[];
}
export interface G1Painel {
  atualizacao?: { hora?: string; data?: string; turno?: number; apuracao_total?: string; encerrado?: boolean };
  total?: G1Bloco;
  municipios?: Record<string, G1Bloco>;
}

const cachePainel = new Map<number, { em: number; p: Promise<G1Painel | null> }>();

function baixarPainel(turno: 1 | 2, timeoutMs: number): Promise<G1Painel | null> {
  const agora = Date.now();
  const c = cachePainel.get(turno);
  if (c && agora - c.em < 30_000) return c.p;
  const p = fetch(PAINEL_G1_URL(turno), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  }).then(async (r) => {
    if (r.status === 404 || r.status === 403) return null; // turno ainda não publicado
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as G1Painel;
  });
  cachePainel.set(turno, { em: agora, p });
  p.catch(() => {
    if (cachePainel.get(turno)?.p === p) cachePainel.delete(turno);
  });
  return p;
}

function numPct(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace("%", "").replace(/\./g, "").replace(",", ".").trim());
  return isFinite(n) ? n : undefined;
}

/** Painel do turno mais recente com apuração em andamento (2º turno quando existir). */
async function painelG1(timeoutMs: number): Promise<G1Painel | null> {
  const [t1, t2] = await Promise.all([baixarPainel(1, timeoutMs), baixarPainel(2, timeoutMs).catch(() => null)]);
  if (t2 && (numPct(t2.atualizacao?.apuracao_total) ?? 0) > 0) return t2;
  return t1;
}

function blocosG1(b: G1Bloco | undefined): { pt?: number; bolso?: number } {
  const out: { pt?: number; bolso?: number } = {};
  for (const c of b?.c ?? []) {
    const nome = normalizarBusca(c.nc ?? "");
    if (c.tc === "BR_13_PRES" || /\blula\b/.test(nome)) out.pt = numPct(c.tp);
    else if (c.tc === "BR_22_PRES" || /\bflavio\b/.test(nome)) out.bolso = numPct(c.tp);
  }
  return out;
}

function fmtBr(n: number | undefined): string {
  return n === undefined ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}

/** Converte o painel do g1 em boletins (só quando a apuração já começou). */
export function boletinsPainelG1(p: G1Painel | null, q: string, municipios: MunicipioTuple[]): Boletim[] {
  if (!p?.atualizacao) return [];
  const a = p.atualizacao;
  const turno = a.turno === 2 ? 2 : 1;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(a.data ?? "");
  const publicadoEm = m && a.hora ? parseData(`${m[3]}-${m[2]}-${m[1]}T${a.hora}-03:00`) : null;
  const out: Boletim[] = [];
  const montar = (id: string, onde: string, pctApurado: number | undefined, bloco: G1Bloco | undefined, escopo: EscopoBoletim) => {
    if (!pctApurado || pctApurado <= 0) return;
    const { pt, bolso } = blocosG1(bloco);
    out.push({
      id,
      tipo: "apuracao",
      fonte: "g1",
      fonteNome: "g1 / Globo (painel de apuração)",
      titulo: `${onde}, ${turno}º turno: com ${fmtBr(pctApurado)} das urnas apuradas, Lula tem ${fmtBr(pt)} e Flávio Bolsonaro, ${fmtBr(bolso)}`,
      url: PAINEL_G1_PAGINA,
      publicadoEm,
      extraido: {
        pctApurado,
        ...(pt !== undefined ? { pt } : {}),
        ...(bolso !== undefined ? { bolso } : {}),
        escopo,
      },
    });
  };
  if (!q) {
    montar(`g1-painel-${turno}t-br`, "Brasil", numPct(a.apuracao_total), p.total, { tipo: "br", nome: "Brasil" });
  } else if (municipios.length && p.municipios) {
    let esc = parseBoletim(`Em ${q}`, municipios).escopo;
    if (esc?.tipo !== "mun") esc = parseBoletim(`cidade de ${q}`, municipios).escopo;
    if (esc?.tipo === "mun" && esc.mun) {
      const t = municipios.find((x) => x[0] === esc!.mun && x[2] === esc!.uf);
      const bloco = t?.[3] ? p.municipios[t[3]] : undefined;
      if (t && bloco) montar(`g1-painel-${turno}t-mun-${t[0]}`, esc.nome, numPct(bloco.ua), bloco, esc);
    }
  }
  return out;
}

interface Tarefa {
  fonte: FonteId;
  rotulo: string;
  url: string;
  viaGoogle: boolean;
}

export interface BuscarOpcoes {
  /** texto livre (lugar, termo) */
  q?: string | null;
  /** restringe às fontes indicadas (vazio = todas) */
  fontes?: FonteId[] | null;
  /** origem do site (ex.: https://meusite.vercel.app) para baixar /data/municipios.json se o fs falhar */
  origem?: string;
  limite?: number;
  timeoutMs?: number;
}

/** Busca, classifica e extrai os números dos boletins da imprensa. */
export async function buscarBoletins(opts: BuscarOpcoes = {}): Promise<BoletinsResponse> {
  const q = limparConsulta(opts.q);
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  const limite = opts.limite ?? LIMITE_PADRAO;
  const pedidas = (opts.fontes ?? []).filter((f): f is FonteId => TODAS_FONTE_IDS.includes(f));
  const selecionadas: FonteId[] = pedidas.length ? [...new Set(pedidas)] : TODAS_FONTE_IDS;

  const tarefas: Tarefa[] = [];
  for (const f of FONTES) {
    if (!selecionadas.includes(f.id)) continue;
    f.rss.forEach((url, i) => tarefas.push({ fonte: f.id, rotulo: `RSS${f.rss.length > 1 ? " " + (i + 1) : ""}`, url, viaGoogle: false }));
    if (f.googleSite) {
      tarefas.push({ fonte: f.id, rotulo: "Google Notícias", url: googleNewsUrl(consultaGoogle(f.googleSite, q)), viaGoogle: true });
    }
  }
  if (selecionadas.includes("outros")) {
    tarefas.push({ fonte: "outros", rotulo: "Google Notícias", url: googleNewsUrl(consultaGoogle(undefined, q)), viaGoogle: true });
  }

  const usarPainelG1 = selecionadas.includes("g1");
  const municipiosP = carregarMunicipios(opts.origem);
  // boletins do exterior (Google Notícias, todos os veículos; cada item é atribuído à fonte pelo domínio)
  // — sem consulta, ou consulta "exterior"/país/cidade do exterior ("Tóquio" precisa da lista de municípios)
  if (!q || consultaExterior(q) || consultaExterior(q, await municipiosP)) {
    CONSULTAS_EXTERIOR.forEach((termos, i) =>
      tarefas.push({
        fonte: "outros",
        rotulo: `Google Notícias (exterior ${i + 1})`,
        url: googleNewsUrl(consultaGoogleExterior(termos)),
        viaGoogle: true,
      }),
    );
  }
  const [municipios, resultados, painel] = await Promise.all([
    municipiosP,
    Promise.allSettled(tarefas.map((t) => baixarComCache(t.url, timeoutMs).then((xml) => lerRss(xml, t.viaGoogle)))),
    usarPainelG1 ? painelG1(timeoutMs).then((p) => ({ ok: true as const, p }), (e) => ({ ok: false as const, e })) : null,
  ]);

  const status = new Map<FonteId, { ok: boolean; erros: string[] }>();
  for (const id of selecionadas) status.set(id, { ok: false, erros: [] });
  // buscas auxiliares de uma fonte não selecionada: só alimentam os veículos selecionados
  const semStatus = { ok: false, erros: [] as string[] };

  const agora = Date.now();
  const candidatos: (Boletim & { _google: boolean; _chave: string })[] = [];

  // painel de apuração do g1 (JSON público) → boletins sintéticos (Brasil e, se a consulta for uma cidade, o município)
  if (painel) {
    if (painel.ok) {
      status.get("g1")!.ok = true;
      for (const b of boletinsPainelG1(painel.p, q, municipios)) candidatos.push({ ...b, _google: false, _chave: b.id });
    } else {
      status.get("g1")!.erros.push(`Painel de apuração: ${msgErro(painel.e)}`);
    }
  }
  resultados.forEach((r, i) => {
    const t = tarefas[i];
    const st = status.get(t.fonte) ?? semStatus;
    if (r.status === "rejected") {
      st.erros.push(`${t.rotulo}: ${msgErro(r.reason)}`);
      return;
    }
    st.ok = true;
    for (const it of r.value) {
      // veículo: pelo domínio (link direto ou <source url> do Google); senão a fonte da tarefa
      const info = fontePorUrl(t.viaGoogle ? it.fonteUrlGoogle : it.url) ?? (t.viaGoogle ? undefined : fontePorUrl(t.url));
      const fonte: FonteId = info?.id ?? (t.fonte === "outros" ? "outros" : t.viaGoogle ? "outros" : t.fonte);
      if (!selecionadas.includes(fonte)) continue;
      const fonteNome = fonte === "outros" ? (it.fonteNomeGoogle ?? FONTE_OUTROS.nome) : nomeFonte(fonte);
      if (it.publicadoEm && agora - Date.parse(it.publicadoEm) > IDADE_MAX_MS) continue;
      const norm = normalizarBusca(`${it.titulo} ${it.resumo}`);
      if (!relevante(norm, normalizarBusca(it.titulo))) continue;
      const { tipo, extraido } = extrair(it.titulo, it.resumo, municipios);
      // consulta livre: o Google casa também pelo corpo da matéria → exige o termo no título/resumo
      if (q && !casaConsulta(norm, q, extraido.escopo)) continue;
      const chave = chaveTitulo(it.titulo);
      candidatos.push({
        id: `${fonte}-${hash(fonte + "|" + chave)}`,
        tipo,
        fonte,
        fonteNome,
        titulo: it.titulo,
        resumo: it.resumo || undefined,
        url: it.url,
        publicadoEm: it.publicadoEm,
        extraido,
        _google: it.viaGoogle,
        _chave: chave,
      });
    }
  });

  // dedupe por título normalizado — prefere o item do feed próprio (URL canônica + resumo)
  candidatos.sort((a, b) => Number(a._google) - Number(b._google));
  const porChave = new Map<string, (typeof candidatos)[number]>();
  for (const c of candidatos) {
    const ja = porChave.get(c._chave);
    if (!ja) porChave.set(c._chave, c);
    else if (!ja.publicadoEm && c.publicadoEm) ja.publicadoEm = c.publicadoEm;
  }
  const quando = (b: Boletim) => (b.publicadoEm ? Date.parse(b.publicadoEm) : 0);
  // páginas-modelo por cidade (ex.: UOL "Zacarias (SP) vai às urnas escolher presidente; siga resultado da apuração"):
  // mesma manchete com o lugar trocado e sem números → no máximo 3 por modelo (prioriza o lugar buscado)
  const temNum = (b: Boletim) =>
    b.extraido.pt !== undefined || b.extraido.bolso !== undefined || b.extraido.pctApurado !== undefined || b.extraido.vencedor
      ? 1
      : 0;
  const porModelo = new Map<string, [string, Boletim][]>();
  for (const [chave, b] of porChave) {
    if (temNum(b)) continue;
    const nomeLugar = b.extraido.escopo && b.extraido.escopo.tipo !== "br" ? b.extraido.escopo.nome.replace(/\s*\([^)]*\)$/, "") : "";
    if (!nomeLugar) continue;
    // sem o lugar e sem siglas de UF ("Zacarias (SP)", "… Presidente Sete Barras SP no 1º Turno")
    const modelo = b.fonte + "|" + chaveTitulo(b.titulo.replace(/\(?\b[A-Z]{2}\b\)?/g, " ")).split(chaveTitulo(nomeLugar)).join("#");
    const arr = porModelo.get(modelo);
    if (arr) arr.push([chave, b]);
    else porModelo.set(modelo, [[chave, b]]);
  }
  const casaLugar = (b: Boletim) => (q && casaConsulta("", q, b.extraido.escopo) ? 1 : 0);
  for (const grupo of porModelo.values()) {
    if (grupo.length <= 3) continue;
    grupo.sort(([, a], [, b]) => casaLugar(b) - casaLugar(a) || quando(b) - quando(a));
    for (const [chave] of grupo.slice(3)) porChave.delete(chave);
  }
  const prioridade = (b: Boletim) => {
    const x = b.extraido;
    const numeros = x.pt !== undefined || x.bolso !== undefined || x.pctApurado !== undefined ? 2 : 0;
    // "Lula vence na China": resultado (ainda que sem %) — fica acima das notícias soltas
    const vencedor = x.vencedor ? 1.5 : x.escopo?.uf === "zz" ? 0.5 : 0;
    const tipo = b.tipo === "apuracao" || b.tipo === "boca-de-urna" ? 1 : b.tipo === "pesquisa" ? 0.5 : 0;
    return numeros + vencedor + tipo;
  };
  // acima do limite, descarta primeiro os itens sem números/"outro"; a ordem final é por data
  const itens: Boletim[] = [...porChave.values()]
    .sort((a, b) => prioridade(b) - prioridade(a) || quando(b) - quando(a))
    .slice(0, limite)
    .sort((a, b) => quando(b) - quando(a))
    .map(({ _google, _chave, ...b }) => {
      void _google;
      void _chave;
      if (b.resumo === undefined) delete b.resumo;
      return b;
    });

  const contagem = new Map<FonteId, number>();
  for (const b of itens) contagem.set(b.fonte, (contagem.get(b.fonte) ?? 0) + 1);

  return {
    geradoEm: new Date().toISOString(),
    consulta: q,
    itens,
    fontes: selecionadas.map((id) => {
      const st = status.get(id)!;
      const f: BoletinsResponse["fontes"][number] = { id, nome: nomeFonte(id), ok: st.ok, itens: contagem.get(id) ?? 0 };
      if (st.erros.length) f.erro = st.erros.join("; ");
      return f;
    }),
  };
}
