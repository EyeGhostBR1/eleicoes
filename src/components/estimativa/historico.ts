// "Evolução da noite": pontos (estimativa × parcial) acumulados NO CLIENTE a cada atualização,
// guardados no localStorage por turno. Store externo (useSyncExternalStore) — sem setState em efeito.
import { useSyncExternalStore } from "react";
import type { EstimativaResponse, Turno } from "@/lib/types";

export interface PontoEvolucao {
  /** atualizadoEm (ISO) da totalização do TSE — chave de deduplicação */
  t: string;
  /** % de seções totalizadas (Brasil) */
  pa: number;
  /** estimativa final (cenário base2022), % dos válidos */
  ePt: number | null;
  eBo: number | null;
  /** parcial apurado, % dos válidos */
  pPt: number | null;
  pBo: number | null;
  /** faixa (intervalo) nacional */
  iPt: [number, number] | null;
  iBo: [number, number] | null;
}

export const MAX_PONTOS = 300;
const chave = (turno: Turno) => `estimativa-historico-v1-t${turno}`;

const r3 = (n: number | null | undefined): number | null =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 1000;
const faixa = (f: [number, number] | null | undefined): [number, number] | null => {
  if (!f) return null;
  const a = r3(f[0]);
  const b = r3(f[1]);
  return a == null || b == null ? null : [a, b];
};

/** Converte uma resposta da API num ponto do gráfico (null se não houver estimativa). */
export function pontoDe(r: EstimativaResponse | null | undefined): PontoEvolucao | null {
  if (!r?.disponivel || !r.br || !r.atualizadoEm) return null;
  const c = r.br.cenarios.base2022;
  const pa = r3(r.br.pctTotalizado);
  if (pa == null) return null;
  return {
    t: r.atualizadoEm,
    pa,
    ePt: r3(c.pt.pct),
    eBo: r3(c.bolso.pct),
    pPt: r3(r.br.parcial.pt),
    pBo: r3(r.br.parcial.bolso),
    iPt: faixa(r.intervalo?.pt),
    iBo: faixa(r.intervalo?.bolso),
  };
}

function valido(p: unknown): p is PontoEvolucao {
  const o = p as PontoEvolucao | null;
  return !!o && typeof o.t === "string" && typeof o.pa === "number" && Number.isFinite(o.pa);
}

const tempo = (p: PontoEvolucao) => {
  const t = Date.parse(p.t);
  return Number.isFinite(t) ? t : 0;
};

/** Ordena por horário e reduz a MAX_PONTOS rareando a metade mais antiga (mantém o 1º ponto). */
function normalizar(arr: PontoEvolucao[]): PontoEvolucao[] {
  let out = arr.slice().sort((a, b) => tempo(a) - tempo(b) || a.pa - b.pa);
  while (out.length > MAX_PONTOS) {
    const metade = Math.floor(out.length / 2);
    const antigos = [out[0]];
    for (let i = 2; i < metade; i += 2) antigos.push(out[i]);
    out = antigos.concat(out.slice(metade));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
const VAZIO: PontoEvolucao[] = [];
const cache = new Map<Turno, PontoEvolucao[]>();
const ouvintes = new Set<() => void>();

function emitir() {
  for (const l of ouvintes) l();
}

function ler(turno: Turno): PontoEvolucao[] {
  const c = cache.get(turno);
  if (c) return c;
  let arr: PontoEvolucao[] = VAZIO;
  try {
    const bruto = window.localStorage.getItem(chave(turno));
    if (bruto) {
      const j: unknown = JSON.parse(bruto);
      if (Array.isArray(j)) arr = normalizar(j.filter(valido));
    }
  } catch {
    // modo privado / armazenamento bloqueado: segue só em memória
  }
  cache.set(turno, arr);
  return arr;
}

function gravar(turno: Turno, arr: PontoEvolucao[]) {
  cache.set(turno, arr);
  try {
    window.localStorage.setItem(chave(turno), JSON.stringify(arr));
  } catch {
    // cota excedida / bloqueado: mantém em memória
  }
  emitir();
}

/** Outra aba gravou o histórico: relê do localStorage. */
function aoMudarStorage(e: StorageEvent) {
  if (e.key == null || e.key.startsWith("estimativa-historico-v1-t")) {
    cache.clear();
    emitir();
  }
}

function inscrever(l: () => void) {
  ouvintes.add(l);
  if (ouvintes.size === 1) window.addEventListener("storage", aoMudarStorage);
  return () => {
    ouvintes.delete(l);
    if (ouvintes.size === 0) window.removeEventListener("storage", aoMudarStorage);
  };
}

/** Acrescenta um ponto (ignora duplicados pelo atualizadoEm). */
export function adicionarPonto(turno: Turno, p: PontoEvolucao | null): void {
  if (!p) return;
  const atual = ler(turno);
  if (atual.some((x) => x.t === p.t)) return;
  gravar(turno, normalizar([...atual, p]));
}

export function limparHistorico(turno: Turno): void {
  cache.set(turno, VAZIO);
  try {
    window.localStorage.removeItem(chave(turno));
  } catch {}
  emitir();
}

/** Pontos acumulados neste navegador para o turno (vazio no servidor). */
export function useHistoricoEvolucao(turno: Turno): PontoEvolucao[] {
  return useSyncExternalStore(
    inscrever,
    () => ler(turno),
    () => VAZIO,
  );
}
