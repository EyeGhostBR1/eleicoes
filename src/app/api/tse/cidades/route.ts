// GET /api/tse/cidades?turno=1|2 → CidadesResponse
// Resultado (Lula × Flávio) e andamento das 50 maiores cidades (src/lib/maiores-cidades.ts).
import type { NextRequest } from "next/server";
import { TURNOS_FINALIZADOS } from "@/lib/config";
import { MAIORES_CIDADES } from "@/lib/maiores-cidades";
import {
  CACHE_FINAL,
  CACHE_LIVE,
  erroResposta,
  getResultado,
  jsonResposta,
  mapLimit,
  parseParamsTse,
  respostaDeErro,
} from "@/lib/tse";
import type { CidadeResultado } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const p = parseParamsTse(request.nextUrl.searchParams);
  if ("erro" in p) return erroResposta(400, p.erro);
  try {
    let erros = 0;
    let primeiroErro: unknown = null;
    const cidades = await mapLimit(MAIORES_CIDADES, 8, async ([cd, uf, nome]): Promise<CidadeResultado> => {
      try {
        const r = await getResultado({ uf, mun: cd, turno: p.turno, ambiente: p.ambiente });
        if (!r) return { cd, uf, nome, r: null };
        return {
          cd,
          uf,
          nome,
          r: {
            pa: r.totais.pctTotalizado,
            vv: r.totais.validos,
            pt: r.blocos.pt?.votos ?? 0,
            bo: r.blocos.bolso?.votos ?? 0,
            comp: r.totais.comparecimento,
            ap: r.totais.eleitorado,
            atualizadoEm: r.atualizadoEm,
            finalizado: r.finalizado,
          },
        };
      } catch (e) {
        erros++;
        primeiroErro ??= e;
        return { cd, uf, nome, r: null };
      }
    });
    // maioria falhou por erro (ex.: bloqueio do TSE) → 502 no-store; o cliente mantém o que tinha
    if (erros * 2 > MAIORES_CIDADES.length && primeiroErro) throw primeiroErro;
    const final = p.ambiente === "oficial" && TURNOS_FINALIZADOS.includes(p.turno) && erros === 0 && cidades.every((c) => c.r?.finalizado);
    return jsonResposta({ turno: p.turno, geradoEm: new Date().toISOString(), cidades }, final ? CACHE_FINAL : CACHE_LIVE);
  } catch (e) {
    return respostaDeErro(e);
  }
}
