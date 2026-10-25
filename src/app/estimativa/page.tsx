import type { Metadata } from "next";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import EstimativaView from "@/components/estimativa/EstimativaView";

export const metadata: Metadata = {
  title: "Estimativa do resultado final",
  description:
    "Projeção do resultado final da eleição presidencial de 2026 a partir da apuração parcial do TSE, corrigida pela ordem de chegada das urnas e comparada com 2022 e 2018: Lula × Flávio Bolsonaro no Brasil e por estado.",
};

export default function EstimativaPage() {
  // EstimativaView lê o turno da URL (useSearchParams) → precisa de Suspense para o prerender.
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Estimativa do resultado final" />}>
      <EstimativaView />
    </Suspense>
  );
}
