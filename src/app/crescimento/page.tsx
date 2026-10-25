import type { Metadata } from "next";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import CrescimentoView from "@/components/crescimento/CrescimentoView";

export const metadata: Metadata = {
  title: "Crescimento do 1º para o 2º turno: 2022 × 2026",
  description:
    "Quanto Lula e Bolsonaro cresceram em votos do 1º para o 2º turno em 2022 e em 2026 (Lula × Flávio), no Brasil, por estado e por município.",
};

export default function CrescimentoPage() {
  // CrescimentoView lê ?uf= da URL (useSearchParams) → precisa de Suspense para o prerender.
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Crescimento do 1º para o 2º turno" />}>
      <CrescimentoView />
    </Suspense>
  );
}
