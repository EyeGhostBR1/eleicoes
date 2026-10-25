// Fontes de boletins da imprensa: feeds RSS próprios (verificados em 04/10/2026)
// + busca no Google Notícias (RSS) com filtro "site:" por veículo.
import type { FonteId } from "../types";

export interface FonteInfo {
  id: FonteId;
  /** nome legível */
  nome: string;
  /** domínios (sufixos de host) que pertencem ao veículo, do mais específico ao mais geral */
  dominios: string[];
  /** feeds RSS próprios que respondem (verificados ao vivo) */
  rss: string[];
  /** domínio usado no filtro "site:" do Google Notícias */
  googleSite?: string;
}

/**
 * Ordem importa no mapeamento por domínio: Folha e Band ficam ANTES do UOL
 * (folha.uol.com.br / band.uol.com.br são subdomínios de uol.com.br).
 */
export const FONTES: FonteInfo[] = [
  {
    id: "g1",
    nome: "g1 / Globo",
    dominios: ["g1.globo.com", "globo.com"],
    rss: ["https://g1.globo.com/rss/g1/politica/eleicoes/", "https://g1.globo.com/rss/g1/"],
    googleSite: "g1.globo.com",
  },
  {
    id: "cnn",
    nome: "CNN Brasil",
    dominios: ["cnnbrasil.com.br"],
    rss: ["https://www.cnnbrasil.com.br/feed/"],
    googleSite: "cnnbrasil.com.br",
  },
  {
    id: "terra",
    nome: "Terra",
    dominios: ["terra.com.br"],
    rss: ["https://www.terra.com.br/noticias/eleicoes/rss.xml", "https://www.terra.com.br/rss/"],
    googleSite: "terra.com.br",
  },
  {
    id: "jovempan",
    nome: "Jovem Pan",
    dominios: ["jovempan.com.br"],
    rss: ["https://jovempan.com.br/politica/feed", "https://jovempan.com.br/feed"],
    googleSite: "jovempan.com.br",
  },
  {
    id: "folha",
    nome: "Folha de S.Paulo",
    dominios: ["folha.uol.com.br", "folha.com.br"],
    rss: ["https://feeds.folha.uol.com.br/poder/rss091.xml", "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml"],
    googleSite: "folha.uol.com.br",
  },
  {
    id: "band",
    nome: "Band",
    dominios: ["band.uol.com.br", "band.com.br"],
    // band.uol.com.br não respondeu (conexão recusada/timeout) nos testes — só via Google Notícias
    rss: [],
    googleSite: "band.uol.com.br",
  },
  {
    id: "uol",
    nome: "UOL",
    dominios: ["uol.com.br"],
    rss: ["https://rss.home.uol.com.br/index.xml", "https://rss.uol.com.br/feed/noticias.xml"],
    googleSite: "uol.com.br",
  },
  {
    id: "estadao",
    nome: "Estadão",
    dominios: ["estadao.com.br"],
    rss: [
      "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/eleicoes/",
      "https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/",
    ],
    googleSite: "estadao.com.br",
  },
  {
    id: "r7",
    nome: "R7",
    dominios: ["r7.com"],
    rss: ["https://noticias.r7.com/arc/outboundfeeds/rss/?outputType=xml"],
    googleSite: "r7.com",
  },
  {
    id: "poder360",
    nome: "Poder360",
    dominios: ["poder360.com.br"],
    rss: ["https://www.poder360.com.br/category/poder-eleicoes-2026/feed/", "https://www.poder360.com.br/feed/"],
    googleSite: "poder360.com.br",
  },
  {
    id: "metropoles",
    nome: "Metrópoles",
    dominios: ["metropoles.com"],
    rss: ["https://www.metropoles.com/feed"], // /brasil/politica-brasil/feed responde, mas parou em 30/09
    googleSite: "metropoles.com",
  },
];

/** "Outros veículos" — vêm da busca geral no Google Notícias (sem filtro de site). */
export const FONTE_OUTROS = { id: "outros" as const, nome: "Outros veículos (Google Notícias)" };

export const TODAS_FONTE_IDS: FonteId[] = [...FONTES.map((f) => f.id), "outros"];

export const FONTE_POR_ID: Record<string, FonteInfo> = Object.fromEntries(FONTES.map((f) => [f.id, f]));

export function nomeFonte(id: FonteId): string {
  return id === "outros" ? FONTE_OUTROS.nome : (FONTE_POR_ID[id]?.nome ?? id);
}

/** Identifica o veículo pelo host de uma URL (ou pelo próprio host). */
export function fontePorUrl(urlOuHost: string | undefined | null): FonteInfo | undefined {
  if (!urlOuHost) return undefined;
  let host = urlOuHost.trim().toLowerCase();
  try {
    if (/^https?:\/\//.test(host)) host = new URL(host).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^www\d?\./, "");
  if (host === "operamundi.uol.com.br") return undefined; // hospedado no UOL, veículo independente
  for (const f of FONTES) {
    for (const d of f.dominios) {
      if (host === d || host.endsWith("." + d)) return f;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Google Notícias
// ---------------------------------------------------------------------------

export const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

/** Termos padrão (sem consulta do usuário). */
export const TERMOS_PADRAO =
  '(Lula OR Flávio) (apuração OR apurados OR apuradas OR urnas OR parcial OR boletim OR "boca de urna" OR votos OR resultado)';
/** Termos da busca geral ("outros veículos"). */
export const TERMOS_GERAL =
  '(Lula OR Flávio) (apuração OR "urnas apuradas" OR "seções totalizadas" OR parcial OR "boca de urna" OR "votos válidos")';

/**
 * Buscas extras (Google Notícias, sem filtro de site) para os boletins do exterior: os resultados por país saem
 * das seções no exterior horas antes da totalização do TSE ("Lula vence na China", "Flávio lidera no Japão").
 * Rodam sempre que não há consulta livre (ou quando a consulta é um país/cidade do exterior).
 */
export const CONSULTAS_EXTERIOR = [
  "Lula vence exterior",
  "Flávio vence exterior",
  '"eleições no exterior" resultado',
  '"boletim de urna" exterior',
  '(Lula OR Flávio) (vence OR lidera OR "fica em 1º" OR "na frente") (país OR países OR Japão OR China OR Portugal OR "Estados Unidos")',
];

export function consultaGoogleExterior(termos: string): string {
  return `${termos} when:1d`;
}

/** Limpa a consulta livre do usuário para uso na busca do Google. */
export function limparConsulta(q: string | null | undefined): string {
  return (q ?? "")
    .replace(/[^\p{L}\p{N}\s\-']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function googleNewsUrl(query: string): string {
  const p = new URLSearchParams({ q: query, hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" });
  return `${GOOGLE_NEWS_RSS}?${p.toString()}`;
}

/** Monta a busca do Google Notícias de um veículo (ou geral, sem site). */
export function consultaGoogle(site: string | undefined, q: string): string {
  const partes: string[] = [];
  if (site) partes.push(`site:${site}`);
  if (q) partes.push("(Lula OR Flávio OR presidente)", q);
  else partes.push(site ? TERMOS_PADRAO : TERMOS_GERAL);
  partes.push("when:1d");
  return partes.join(" ");
}
