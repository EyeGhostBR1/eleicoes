// GET /api/estimativa?turno=1|2&amb=oficial|simulado → EstimativaResponse
// (estimativa do resultado final a partir da apuração parcial, comparada com 2022/2018).
// `amb` é oculto na UI (padrão "oficial"); "simulado" serve só para testes de encanamento.
import type { NextRequest } from "next/server";
import { erroResposta, jsonResposta, parseParamsTse, respostaDeErro } from "@/lib/tse";
import { CACHE_ESTIMATIVA, CACHE_ESTIMATIVA_INDISPONIVEL, getEstimativa } from "@/lib/estimativa/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams);
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    const r = await getEstimativa({ turno: p.turno, ambiente: p.ambiente });
    return jsonResposta(r, r.disponivel ? CACHE_ESTIMATIVA : CACHE_ESTIMATIVA_INDISPONIVEL);
  } catch (e) {
    return respostaDeErro(e);
  }
}
