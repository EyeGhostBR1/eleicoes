import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import CidadeView from "@/components/views/CidadeView";
import { UF_POR_SIGLA } from "@/lib/config";

type Props = { params: Promise<{ uf: string; cd: string }> };

function validar(uf: string, cd: string): { uf: string; cd: string } | null {
  const u = uf.toLowerCase();
  if (!UF_POR_SIGLA[u] || !/^\d{5}$/.test(cd)) return null;
  return { uf: u, cd };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const v = validar(p.uf, p.cd);
  if (!v) return { title: "Município não encontrado" };
  const info = UF_POR_SIGLA[v.uf];
  return {
    title: `Município · ${info.sigla === "zz" ? "Exterior" : info.nome}`,
    description: `Apuração 2026 no município (${info.nome}): Lula × Flávio Bolsonaro comparados com 2022 e 2018.`,
  };
}

export default async function CidadePage({ params }: Props) {
  const p = await params;
  const v = validar(p.uf, p.cd);
  if (!v) notFound();
  return (
    <Suspense fallback={<PaginaSkeleton />}>
      <CidadeView uf={v.uf} cd={v.cd} />
    </Suspense>
  );
}
