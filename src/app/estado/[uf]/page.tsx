import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import EstadoView from "@/components/views/EstadoView";
import { UFS, UF_POR_SIGLA } from "@/lib/config";

type Props = { params: Promise<{ uf: string }> };

export function generateStaticParams() {
  return UFS.map((u) => ({ uf: u.sigla }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { uf } = await params;
  const info = UF_POR_SIGLA[uf.toLowerCase()];
  if (!info) return { title: "Estado não encontrado" };
  const nome = info.sigla === "zz" ? "Exterior" : `${info.nome} (${info.sigla.toUpperCase()})`;
  return {
    title: nome,
    description: `Apuração 2026 em ${info.nome}: Lula × Flávio Bolsonaro comparados com 2022 e 2018, por município.`,
  };
}

export default async function EstadoPage({ params }: Props) {
  const { uf: bruto } = await params;
  const uf = bruto.toLowerCase();
  const info = UF_POR_SIGLA[uf];
  if (!info) notFound();
  return (
    <Suspense fallback={<PaginaSkeleton titulo={info.nome} />}>
      <EstadoView uf={uf} />
    </Suspense>
  );
}
