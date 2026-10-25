import type { Metadata } from "next";
import { Suspense } from "react";
import BoletinsClient from "@/components/boletins/BoletinsClient";
import { BoletinsCarregando } from "@/components/boletins/Esqueletos";

export const metadata: Metadata = {
  title: { absolute: "Boletins da imprensa — Apuração 2026" },
  description:
    "Boletins de apuração da eleição presidencial de 2026 publicados por g1, CNN Brasil, Folha, Estadão, UOL e outros veículos — inclusive os resultados por país no exterior — comparados automaticamente com 2022, 2018 e com os números oficiais (TSE e boletins de urna) em tempo real.",
};

export default function BoletinsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Apuração 2026 · Presidente
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Boletins da imprensa
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Os números divulgados por g1, CNN Brasil, Folha, Estadão, UOL e outros veículos durante a apuração — inclusive
          os resultados por país no exterior — comparados automaticamente com 2022 (Lula × Jair Bolsonaro), 2018 (Haddad ×
          Jair Bolsonaro) e com os números oficiais de agora (boletins de urna do exterior e totalização do TSE).
        </p>
      </header>
      {/* BoletinsClient lê a URL (useSearchParams) → precisa de Suspense para o prerender. */}
      <Suspense fallback={<BoletinsCarregando />}>
        <BoletinsClient />
      </Suspense>
    </div>
  );
}
