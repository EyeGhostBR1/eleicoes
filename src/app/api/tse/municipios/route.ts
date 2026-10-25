// GET /api/tse/municipios?uf=<uf>|zz&turno=1|2&amb=oficial|simulado → MunicipiosResponse
// (uma linha compacta por município da UF; até 853 em MG).
import type { NextRequest } from "next/server";
import { CACHE_MUNICIPIOS, erroResposta, getMunicipios, jsonResposta, parseParamsTse, respostaDeErro } from "@/lib/tse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams, { uf: "uf" });
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    const r = await getMunicipios({ uf: p.uf!, turno: p.turno, ambiente: p.ambiente }, { prazoMs: 45_000 });
    return jsonResposta(r, CACHE_MUNICIPIOS);
  } catch (e) {
    return respostaDeErro(e);
  }
}
