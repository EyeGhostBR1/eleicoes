import type { Metadata } from "next";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import MapaInterativo from "@/components/mapa/MapaInterativo";

export const metadata: Metadata = {
  title: "Mapa interativo dos municípios",
  description:
    "Mapa com zoom de todos os municípios do Brasil: Lula × Flávio Bolsonaro em 2026, variação entre o 1º e o 2º turno e comparação com 2022 e 2018.",
};

export default function MapaPage() {
  // MapaInterativo lê o turno da URL (useSearchParams) → precisa de Suspense para o prerender.
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Mapa interativo dos municípios" />}>
      <MapaInterativo />
    </Suspense>
  );
}
