// GET /api/tse/tempos?turno=1|2[&uf=<uf>] → TemposResponse
// Ritmo da apuração (eleitorado em municípios concluídos × minutos após o fechamento das urnas)
// no Brasil e por UF; com ?uf=, também o minuto de conclusão de cada município da UF.
import type { NextRequest } from "next/server";
import { TURNOS_FINALIZADOS, UF_POR_SIGLA } from "@/lib/config";
import { CACHE_FINAL, CACHE_MUNICIPIOS, erroResposta, getTempos, jsonResposta, parseParamsTse, respostaDeErro } from "@/lib/tse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const p = parseParamsTse(sp);
  if ("erro" in p) return erroResposta(400, p.erro);
  const uf = (sp.get("uf") ?? "").trim().toLowerCase() || null;
  if (uf && (!UF_POR_SIGLA[uf] || uf === "zz")) return erroResposta(400, `Parâmetro 'uf' inválido: "${uf.slice(0, 10)}".`);
  try {
    const r = await getTempos({ turno: p.turno, ambiente: p.ambiente, uf });
    const completo = Object.values(r.ufs).every((u) => u != null);
    const final = p.ambiente === "oficial" && TURNOS_FINALIZADOS.includes(p.turno) && completo;
    return jsonResposta(r, final ? CACHE_FINAL : CACHE_MUNICIPIOS);
  } catch (e) {
    return respostaDeErro(e);
  }
}
