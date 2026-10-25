// GET /api/tse/resultado?uf=br|<uf>|zz&mun=<5 dígitos>&turno=1|2&amb=oficial|simulado[&vazio=1]
// → LiveResult. 404 quando o TSE ainda não divulgou dados para a abrangência.
import type { NextRequest } from "next/server";
import {
  CACHE_FINAL,
  CACHE_LIVE,
  CACHE_NAO_DIVULGADO,
  erroResposta,
  getResultado,
  jsonResposta,
  MSG_NAO_DIVULGADO,
  parseParamsTse,
  respostaDeErro,
} from "@/lib/tse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams, { uf: "br-ou-uf", mun: true });
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    const r = await getResultado(
      { uf: p.uf!, mun: p.mun ?? undefined, turno: p.turno, ambiente: p.ambiente },
      { incluirVazio: p.vazio },
    );
    if (!r) return erroResposta(404, MSG_NAO_DIVULGADO, CACHE_NAO_DIVULGADO);
    return jsonResposta(r, r.finalizado ? CACHE_FINAL : CACHE_LIVE);
  } catch (e) {
    return respostaDeErro(e);
  }
}
