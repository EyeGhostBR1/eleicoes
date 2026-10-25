import type { Metadata } from "next";
import { Suspense } from "react";
import ExteriorView from "@/components/exterior/ExteriorView";
import PaginaSkeleton from "@/components/PaginaSkeleton";

export const metadata: Metadata = {
  title: "Exterior — votos por país",
  description:
    "Boletins de urna oficiais (TSE) das seções no exterior já encerradas, agregados por país e cidade: Lula × Flávio Bolsonaro em 2026 comparados com 2022 e 2018 nas mesmas cidades.",
};

export default function ExteriorPage() {
  // ExteriorView lê o turno da URL (useSearchParams) → precisa de Suspense para o prerender.
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Exterior — votos por país" />}>
      <ExteriorView />
    </Suspense>
  );
}
