// GET /api/tse/estados?turno=1|2&amb=oficial|simulado → EstadosResponse (Brasil + todas as UFs + exterior).
import type { NextRequest } from "next/server";
import { CACHE_FINAL, CACHE_LIVE, erroResposta, getEstados, jsonResposta, parseParamsTse, respostaDeErro } from "@/lib/tse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams);
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    const r = await getEstados({ turno: p.turno, ambiente: p.ambiente });
    const completo = !!r.br?.finalizado && Object.values(r.ufs).every((u) => u != null);
    return jsonResposta(r, completo ? CACHE_FINAL : CACHE_LIVE);
  } catch (e) {
    return respostaDeErro(e);
  }
}
