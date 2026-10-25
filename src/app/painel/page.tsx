import type { Metadata } from "next";
import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import PainelView from "@/components/painel/PainelView";

export const metadata: Metadata = {
  title: "Painel 1º × 2º turno: resultado e tempo de apuração",
  description:
    "Estados e maiores cidades no 1º e no 2º turno de 2026: Lula × Flávio Bolsonaro, ritmo da apuração depois do fechamento das urnas e comparação entre os turnos.",
};

export default function PainelPage() {
  // PainelView lê ?uf= da URL (useSearchParams) → precisa de Suspense para o prerender.
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Painel 1º × 2º turno" />}>
      <PainelView />
    </Suspense>
  );
}
