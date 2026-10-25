// Helpers HTTP compartilhados pelas rotas /api/tse/* (Web Request/Response puros, sem Next).
import type { Ambiente, Turno } from "../types";
import { TseFetchError } from "./fetch";
import { UFS_VALIDAS } from "./service";

export const CACHE_LIVE = "public, s-maxage=15, stale-while-revalidate=30";
export const CACHE_MUNICIPIOS = "public, s-maxage=45, stale-while-revalidate=90";
export const CACHE_ERRO = "no-store";
/**
 * 404 "ainda não divulgado" é um estado esperado (o dia todo até ~17h, e o 2º turno até 25/10):
 * cache curto no CDN para não invocar a função a cada poll de cada cliente. Erros de verdade
 * (400/500/502) continuam no-store.
 */
export const CACHE_NAO_DIVULGADO = "public, s-maxage=10, stale-while-revalidate=10";

export const MSG_NAO_DIVULGADO = "Resultados ainda não divulgados pelo TSE para esta abrangência.";

export interface ParamsTse {
  uf: string | null;
  mun: string | null;
  turno: Turno;
  ambiente: Ambiente;
  /** ?vazio=1 → devolve o placeholder zerado do TSE em vez de 404 (antes do início da apuração) */
  vazio: boolean;
}

/**
 * Lê e valida os parâmetros comuns. Ausentes usam padrão (turno=1, amb=oficial);
 * inválidos retornam `{ erro }` (→ HTTP 400).
 */
export function parseParamsTse(
  sp: URLSearchParams,
  exigir: { uf?: "br-ou-uf" | "uf" | false; mun?: boolean } = {},
): ParamsTse | { erro: string } {
  const turnoS = sp.get("turno") ?? "1";
  if (turnoS !== "1" && turnoS !== "2") return { erro: "Parâmetro 'turno' inválido (use 1 ou 2)." };
  const ambS = sp.get("amb") ?? "oficial";
  if (ambS !== "oficial" && ambS !== "simulado") return { erro: "Parâmetro 'amb' inválido (use oficial ou simulado)." };

  let uf: string | null = null;
  if (exigir.uf) {
    const u = (sp.get("uf") ?? "").trim().toLowerCase();
    if (!u) return { erro: "Parâmetro 'uf' obrigatório." };
    if (!UFS_VALIDAS.has(u) || (exigir.uf === "uf" && u === "br"))
      return { erro: `Parâmetro 'uf' inválido: "${u.slice(0, 10)}".` };
    uf = u;
  }

  let mun: string | null = null;
  if (exigir.mun) {
    const m = (sp.get("mun") ?? "").trim();
    if (m) {
      if (!/^\d{5}$/.test(m)) return { erro: "Parâmetro 'mun' inválido (código TSE de 5 dígitos)." };
      if (uf === "br") return { erro: "Para 'mun' informe a UF do município (não 'br')." };
      mun = m;
    }
  }

  const vz = sp.get("vazio");
  return { uf, mun, turno: Number(turnoS) as Turno, ambiente: ambS, vazio: vz === "1" || vz === "true" };
}

export function jsonResposta(data: unknown, cacheControl: string = CACHE_LIVE, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": cacheControl } });
}

export function erroResposta(status: number, erro: string, cacheControl: string = CACHE_ERRO): Response {
  return Response.json({ erro }, { status, headers: { "Cache-Control": cacheControl } });
}

/** Converte exceções do serviço em resposta JSON (502 para falha no TSE, 500 nos demais). */
export function respostaDeErro(e: unknown): Response {
  if (e instanceof TseFetchError) {
    console.error("[api/tse]", e.message, e.url);
    return erroResposta(502, `Falha ao consultar o TSE: ${e.message}`);
  }
  console.error("[api/tse] erro inesperado", e);
  return erroResposta(500, "Erro interno ao processar os resultados do TSE.");
}
