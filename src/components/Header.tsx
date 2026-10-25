"use client";
// Cabeçalho global: marca, navegação, seleção de estado, busca de município e
// alternância de turno — estado mantido na URL. O site usa sempre os dados oficiais do TSE.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useParamsState } from "@/lib/client/hooks";
import { UFS } from "@/lib/config";
import type { Turno } from "@/lib/types";
import BuscaMunicipio from "./BuscaMunicipio";
import { Segmentado, cx } from "./ui";

function Marca({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2 font-bold tracking-tight text-strong">
      <span aria-hidden className="flex h-6 w-6 overflow-hidden rounded-md">
        <span className="w-1/2 bg-pt" />
        <span className="w-1/2 bg-bolso" />
      </span>
      <span className="text-base sm:text-lg">Apuração 2026</span>
    </Link>
  );
}

/** Versão estática exibida enquanto os parâmetros da URL não estão disponíveis. */
export function HeaderFallback() {
  return (
    <header className="z-40 border-b border-line bg-surface/90 backdrop-blur lg:sticky lg:top-0">
      <div className="mx-auto flex h-[52px] max-w-7xl items-center gap-4 px-3 sm:px-4">
        <Marca />
      </div>
    </header>
  );
}

function Curto({ curto, longo }: { curto: string; longo: string }) {
  return (
    <>
      <span className="sm:hidden" aria-hidden>
        {curto}
      </span>
      <span className="max-sm:sr-only">{longo}</span>
    </>
  );
}

function ufAtual(pathname: string): string {
  const m = pathname.match(/^\/(?:estado|cidade)\/([a-z]{2})(?:\/|$)/i);
  return m ? m[1].toLowerCase() : "";
}

export default function Header() {
  const { turno, set, qs } = useParamsState();
  const pathname = usePathname();
  const router = useRouter();
  const uf = ufAtual(pathname);

  const navLink = (href: string, rotulo: string, ativo: boolean) => (
    <Link
      href={`${href}${qs}`}
      aria-current={ativo ? "page" : undefined}
      className={cx(
        "rounded-md px-2 py-1 text-sm font-medium transition-colors",
        ativo ? "bg-surface-2 text-strong" : "text-muted hover:text-fg",
      )}
    >
      {rotulo}
    </Link>
  );

  return (
    <header className="z-40 border-b border-line bg-surface/90 backdrop-blur lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
        <Marca href={`/${qs}`} />

        <nav aria-label="Principal" className="flex flex-wrap items-center gap-1">
          {navLink("/", "Brasil", pathname === "/")}
          {navLink("/mapa", "Mapa", pathname.startsWith("/mapa"))}
          {navLink("/crescimento", "Crescimento", pathname.startsWith("/crescimento"))}
          {navLink("/estimativa", "Estimativa", pathname.startsWith("/estimativa"))}
          <label className="sr-only" htmlFor="sel-estado">
            Estados
          </label>
          <select
            id="sel-estado"
            value={uf}
            onChange={(e) => {
              const v = e.target.value;
              if (v) router.push(`/estado/${v}${qs}`);
            }}
            className={cx(
              "h-8 max-w-[9.5rem] rounded-md border border-line bg-surface px-1.5 text-sm font-medium",
              uf ? "text-strong" : "text-muted",
            )}
          >
            <option value="">Estados…</option>
            {UFS.map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.sigla === "zz" ? "Exterior" : `${u.sigla.toUpperCase()} — ${u.nome}`}
              </option>
            ))}
          </select>
          {navLink("/exterior", "Exterior", pathname.startsWith("/exterior"))}
          {navLink("/boletins", "Boletins", pathname.startsWith("/boletins"))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Segmentado<Turno>
            rotulo="Turno"
            valor={turno}
            onChange={(t) => set({ turno: t })}
            opcoes={[
              { valor: 1, rotulo: <Curto curto="1º T" longo="1º turno" /> },
              { valor: 2, rotulo: <Curto curto="2º T" longo="2º turno" /> },
            ]}
          />
        </div>

        <BuscaMunicipio className="order-last w-full lg:order-none lg:w-72" />
      </div>
    </header>
  );
}
