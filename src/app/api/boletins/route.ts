// GET /api/boletins?q=<texto livre>&fontes=<ids separados por vírgula> → BoletinsResponse
// Agrega boletins da imprensa (RSS dos veículos + Google Notícias), classifica e extrai números.
import type { NextRequest } from "next/server";
import { buscarBoletins } from "@/lib/news/fetch";
import { TODAS_FONTE_IDS } from "@/lib/news/sources";
import type { FonteId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const CACHE = "public, s-maxage=60, stale-while-revalidate=120";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").slice(0, 120);
  const fontes = (sp.get("fontes") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is FonteId => (TODAS_FONTE_IDS as string[]).includes(s));
  try {
    const dados = await buscarBoletins({ q, fontes, origem: request.nextUrl.origin });
    return Response.json(dados, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ erro: `Falha ao buscar boletins: ${msg}` }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
