// GET /api/exterior?turno=1|2 → ExteriorResponse
// Votos do exterior somados a partir dos boletins de urna (BU) oficiais que o TSE já publicou
// seção a seção (antes da totalização das 17h). 404 quando o turno ainda não tem essa fonte.
import type { NextRequest } from "next/server";
import { getExterior, statsDaResposta } from "@/lib/exterior/service";
import { TURNOS_FINALIZADOS } from "@/lib/config";
import { CACHE_FINAL, erroResposta, jsonResposta, respostaDeErro } from "@/lib/tse/http";
import type { Turno } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=600";
/**
 * Resposta PARCIAL (a execução não consultou toda a fila: instância fria, prazo, 429/rede): cache
 * curto no CDN, para que um retrato incompleto (com menos seções que o de outra instância) não
 * fique servido por 1 min + SWR e a próxima chamada complete logo a fila.
 */
const CACHE_PARCIAL = "public, s-maxage=10, stale-while-revalidate=60";
/** "ainda sem dados" é um estado esperado (2º turno até 25/10): cache curto no CDN. */
const CACHE_SEM_FONTE = "public, s-maxage=60, stale-while-revalidate=60";

export async function GET(request: NextRequest) {
  const turnoS = request.nextUrl.searchParams.get("turno") ?? "1";
  if (turnoS !== "1" && turnoS !== "2") return erroResposta(400, "Parâmetro 'turno' inválido (use 1 ou 2).");
  const turno = Number(turnoS) as Turno;
  try {
    const r = await getExterior({ turno });
    if (!r) {
      return erroResposta(
        404,
        `Boletins de urna do exterior ainda não disponíveis no TSE para o ${turno}º turno.`,
        CACHE_SEM_FONTE,
      );
    }
    const st = statsDaResposta(r);
    if (st && !st.completo && st.verificadas === 0 && st.recebidasTotal === 0) {
      // nada em memória e nenhuma seção pôde ser consultada (TSE limitando/fora do ar): não publica
      // um "zero" no CDN — erro sem cache, o cliente (SWR) mantém os dados que já tinha
      return erroResposta(502, "Falha ao consultar o TSE: boletins de urna do exterior indisponíveis no momento.");
    }
    if (st && !st.completo) return jsonResposta(r, CACHE_PARCIAL);
    // turno encerrado com todos os boletins recebidos: não muda mais → cache longo
    const final = TURNOS_FINALIZADOS.includes(turno) && r.total.secoesTotal > 0 && r.total.secoesRecebidas >= r.total.secoesTotal;
    return jsonResposta(r, final ? CACHE_FINAL : CACHE_OK);
  } catch (e) {
    return respostaDeErro(e);
  }
}
