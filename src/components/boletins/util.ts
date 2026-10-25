// Utilitários e hooks da página /boletins (somente cliente).
import { useEffect, useState, useSyncExternalStore } from "react";
import { UF_POR_SIGLA } from "@/lib/config";
import { paisDaCidade } from "@/lib/exterior/paises";
import { fmtHora } from "@/lib/format";
import type { EscopoBoletim, FonteId, MunicipioTuple, NumerosBoletim, TipoBoletim } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Fontes e tipos
// ---------------------------------------------------------------------------

export interface FonteInfo {
  id: FonteId;
  nome: string;
  /** rótulo curto do selo */
  curto: string;
  /** cor de identificação (tons neutros/médios — evita vermelho/azul dos blocos) */
  cor: string;
}

/** Veículos consultados, na ordem dos filtros. */
export const FONTES_INFO: FonteInfo[] = [
  { id: "g1", nome: "g1 / Globo", curto: "g1", cor: "#f97316" },
  { id: "cnn", nome: "CNN Brasil", curto: "CNN", cor: "#71717a" },
  { id: "terra", nome: "Terra", curto: "Terra", cor: "#10b981" },
  { id: "jovempan", nome: "Jovem Pan", curto: "Jovem Pan", cor: "#f59e0b" },
  { id: "uol", nome: "UOL", curto: "UOL", cor: "#d946ef" },
  { id: "folha", nome: "Folha", curto: "Folha", cor: "#64748b" },
  { id: "estadao", nome: "Estadão", curto: "Estadão", cor: "#14b8a6" },
  { id: "band", nome: "Band", curto: "Band", cor: "#8b5cf6" },
  { id: "r7", nome: "R7", curto: "R7", cor: "#84cc16" },
  { id: "poder360", nome: "Poder360", curto: "Poder360", cor: "#06b6d4" },
  { id: "metropoles", nome: "Metrópoles", curto: "Metrópoles", cor: "#eab308" },
];

const FONTE_OUTROS: FonteInfo = { id: "outros", nome: "Outros", curto: "Outros", cor: "#a8a29e" };

export const FONTE_POR_ID: Record<string, FonteInfo> = Object.fromEntries(
  [...FONTES_INFO, FONTE_OUTROS].map((f) => [f.id, f]),
);

export function infoFonte(id: string): FonteInfo {
  return FONTE_POR_ID[id] ?? FONTE_OUTROS;
}

export const TIPOS: { id: TipoBoletim; rotulo: string; rotuloItem: string }[] = [
  { id: "apuracao", rotulo: "Apuração", rotuloItem: "Apuração" },
  { id: "boca-de-urna", rotulo: "Boca de urna", rotuloItem: "Boca de urna" },
  { id: "pesquisa", rotulo: "Pesquisas", rotuloItem: "Pesquisa" },
  { id: "outro", rotulo: "Outros", rotuloItem: "Notícia" },
];

/** Padrão: resultados (apuração e boca de urna); pesquisas de intenção de voto ficam desligadas. */
export const TIPOS_PADRAO: TipoBoletim[] = ["apuracao", "boca-de-urna"];

export function rotuloTipo(t: TipoBoletim): string {
  return TIPOS.find((x) => x.id === t)?.rotuloItem ?? "Notícia";
}

const IDS_FONTE = new Set<string>(FONTES_INFO.map((f) => f.id));
const IDS_TIPO = new Set<string>(TIPOS.map((t) => t.id));

/** Lê ?fontes=g1,cnn (ignora ids desconhecidos). */
export function lerFontesParam(v: string | null): FonteId[] {
  if (!v) return [];
  return Array.from(new Set(v.split(",").map((s) => s.trim()).filter((s) => IDS_FONTE.has(s)))) as FonteId[];
}

export type FiltroLocal = "todos" | "brasil" | "exterior";

/** Lê ?local=exterior|brasil (ausente = todos). */
export function lerLocalParam(v: string | null): FiltroLocal {
  return v === "exterior" || v === "brasil" ? v : "todos";
}

/** Lê ?tipos=apuracao,pesquisa | "todos" (lista vazia = todos). Ausente = padrão. */
export function lerTiposParam(v: string | null): TipoBoletim[] {
  if (v == null) return TIPOS_PADRAO;
  if (v === "todos") return [];
  const l = Array.from(new Set(v.split(",").map((s) => s.trim()).filter((s) => IDS_TIPO.has(s)))) as TipoBoletim[];
  return l.length ? l : TIPOS_PADRAO;
}

// ---------------------------------------------------------------------------
// Números / escopo
// ---------------------------------------------------------------------------

function finito(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/** Boletim tem números comparáveis (Lula e/ou Flávio). */
export function temNumeros(n: NumerosBoletim | null | undefined): boolean {
  return !!n && (finito(n.pt) || finito(n.bolso));
}

/** Boletim diz quem venceu/lidera no lugar ("Lula vence na China"). */
export function temVencedor(n: NumerosBoletim | null | undefined): boolean {
  return !!n && (n.vencedor === "pt" || n.vencedor === "bolso");
}

/** Escopo no exterior (total, país ou cidade — uf "zz"). */
export function ehExterior(e: EscopoBoletim | null | undefined): boolean {
  return !!e && e.tipo !== "br" && (e.uf ?? "").toLowerCase() === "zz";
}

export const BRASIL: EscopoBoletim = { tipo: "br", nome: "Brasil" };

export function siglaUf(uf: string | undefined): string {
  return (uf ?? "").toUpperCase();
}

/** Nome próprio a partir de texto todo em maiúsculas ("SÃO JOÃO DEL REI" → "São João del Rei"). */
export function nomeProprio(s: string): string {
  if (!s || s !== s.toUpperCase()) return s;
  const menores = new Set(["de", "da", "do", "das", "dos", "e", "del", "d'"]);
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((p, i) => {
      if (!p.trim() || p === "-") return p;
      if (i > 0 && menores.has(p)) return p;
      if (p.startsWith("d'") && p.length > 2) return "d'" + p[2].toUpperCase() + p.slice(3);
      return p[0].toUpperCase() + p.slice(1);
    })
    .join("");
}

export function escopoUf(sigla: string): EscopoBoletim {
  const s = sigla.toLowerCase();
  return { tipo: "uf", uf: s, nome: UF_POR_SIGLA[s]?.nome ?? s.toUpperCase() };
}

export function escopoMun(t: MunicipioTuple): EscopoBoletim {
  const [cd, nome, uf] = t;
  if (uf.toLowerCase() === "zz") {
    const p = paisDaCidade(cd);
    return { tipo: "mun", uf: "zz", mun: cd, nome: `${nomeProprio(nome)} (${p ? p.pais : "Exterior"})` };
  }
  return { tipo: "mun", uf: uf.toLowerCase(), mun: cd, nome: `${nomeProprio(nome)} (${siglaUf(uf)})` };
}

/** País estrangeiro (votos no exterior). */
export function escopoPais(pais: string): EscopoBoletim {
  return { tipo: "pais", uf: "zz", pais, nome: `${pais} (exterior)` };
}

export function chaveEscopo(e: EscopoBoletim): string {
  if (e.tipo === "br") return "br";
  if (e.tipo === "uf") return `uf:${e.uf}`;
  if (e.tipo === "pais") return `pais:${e.pais}`;
  return `mun:${e.uf}:${e.mun}`;
}

export function rotuloTipoEscopo(e: EscopoBoletim): string {
  if (e.tipo === "br") return "País";
  if (e.tipo === "pais") return "País · exterior";
  if (e.tipo === "uf") return e.uf === "zz" ? "Exterior" : "Estado";
  return e.uf === "zz" ? "Cidade · exterior" : "Município";
}

const nfLivre = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** "62%", "47,83%" — sem zeros à direita (como citado pelo veículo). */
export function fmtPctLivre(n: number | null | undefined): string {
  return finito(n) ? `${nfLivre.format(n)}%` : "—";
}

/** Valor de campo editável ("47,8"). */
export function fmtCampo(n: number | null | undefined): string {
  return finito(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false }) : "";
}

/** Lê um percentual digitado ("47,8", "47.8%", " 62 "). null se vazio/inválido. */
export function lerPct(s: string): number | null {
  const t = s.replace(/%/g, "").replace(/\s+/g, "").replace(",", ".");
  if (!t || !/^\d{1,3}(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Campo preenchido mas inválido (ou fora de 0–100). */
export function campoInvalido(s: string): boolean {
  if (!s.trim()) return false;
  const n = lerPct(s);
  return n == null || n < 0 || n > 100;
}

/** Só aceita links http(s) vindos dos feeds. */
export function urlSegura(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "http:" || x.protocol === "https:" ? x.toString() : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/** "agora", "há 5 min", "há 1 h 20 min", "há 3 h", "há 2 dias". null quando sem data/relógio. */
export function tempoRelativo(iso: string | null | undefined, agora: number): string | null {
  if (!iso || !agora) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.round((agora - t) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const r = m % 60;
    return h < 3 && r ? `há ${h} h ${r} min` : `há ${h} h`;
  }
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}

const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** "18:32" se for hoje (Brasília), senão "03/10 18:32". */
export function horaCurta(iso: string | null | undefined, agora: number): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hora = fmtHora(iso);
  if (agora && fmtDia.format(d) === fmtDia.format(new Date(agora))) return hora;
  return `${fmtDia.format(d)} ${hora}`;
}

/** "18:32:10" (Brasília). */
export function horaSeg(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Ordena por data de publicação (mais recente primeiro; sem data no fim). */
export function ordenarPorData<T extends { publicadoEm: string | null }>(itens: T[]): T[] {
  const t = (x: T) => {
    const v = x.publicadoEm ? Date.parse(x.publicadoEm) : NaN;
    return Number.isNaN(v) ? -Infinity : v;
  };
  return [...itens].sort((a, b) => t(b) - t(a));
}

// Relógio compartilhado (atualiza a cada 15 s). No servidor/hidratação retorna 0.
let agoraAtual = 0;
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;

function assinarRelogio(cb: () => void) {
  ouvintes.add(cb);
  agoraAtual = Date.now();
  if (!relogio) {
    relogio = setInterval(() => {
      agoraAtual = Date.now();
      ouvintes.forEach((f) => f());
    }, 15_000);
  }
  cb();
  return () => {
    ouvintes.delete(cb);
    if (!ouvintes.size && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

/** Timestamp atual (ms), atualizado periodicamente. 0 antes de montar no cliente. */
export function useAgora(): number {
  return useSyncExternalStore(
    assinarRelogio,
    () => agoraAtual,
    () => 0,
  );
}

/** Valor com atraso (debounce). */
export function useAtrasado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/**
 * Carregamento preguiçoso: `visto` vira true quando o elemento chega perto da tela (e não volta).
 * Com `ativo = false`, `visto` é sempre true.
 */
export function useNaTela<T extends Element>(ativo = true, margem = "300px") {
  const [el, setEl] = useState<T | null>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    if (!ativo || visto || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) {
          setVisto(true);
          io.disconnect();
        }
      },
      { rootMargin: margem },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ativo, visto, el, margem]);
  return { ref: setEl, visto: !ativo || visto };
}
