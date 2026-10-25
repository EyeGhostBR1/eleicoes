// GET /api/tse/municipios?uf=<uf>|zz&turno=1|2&amb=oficial|simulado → MunicipiosResponse
// (uma linha compacta por município da UF; até 853 em MG).
import type { NextRequest } from "next/server";
import { TURNOS_FINALIZADOS } from "@/lib/config";
import { CACHE_FINAL, CACHE_MUNICIPIOS, erroResposta, getMunicipios, jsonResposta, parseParamsTse, respostaDeErro } from "@/lib/tse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams, { uf: "uf" });
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    const r = await getMunicipios({ uf: p.uf!, turno: p.turno, ambiente: p.ambiente }, { prazoMs: 45_000 });
    // turno já finalizado e sem falhas nesta carga → resposta definitiva, cache longo
    const final = p.ambiente === "oficial" && TURNOS_FINALIZADOS.includes(p.turno) && r.falhas.length === 0;
    return jsonResposta(r, final ? CACHE_FINAL : CACHE_MUNICIPIOS);
  } catch (e) {
    return respostaDeErro(e);
  }
}
