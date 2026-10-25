"use client";
import type { ReactNode } from "react";
import { BLOCOS } from "@/lib/config";
import { fmtDataHora } from "@/lib/format";
import type { Boletim, TipoBoletim } from "@/lib/types";
import ComparacaoBoletim from "./ComparacaoBoletim";
import FonteBadge from "./FonteBadge";
import { BRASIL, cx, ehExterior, fmtPctLivre, horaCurta, rotuloTipo, temNumeros, tempoRelativo, urlSegura } from "./util";

const ESTILO_TIPO: Record<TipoBoletim, string> = {
  apuracao: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  "boca-de-urna": "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  pesquisa: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300",
  outro: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function TipoTag({ tipo }: { tipo: TipoBoletim }) {
  return (
    <span
      className={cx(
        "inline-block rounded border px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide",
        ESTILO_TIPO[tipo] ?? ESTILO_TIPO.outro,
      )}
    >
      {rotuloTipo(tipo)}
    </span>
  );
}

function Quando({ iso, agora }: { iso: string | null; agora: number }) {
  if (!iso) return null;
  const rel = tempoRelativo(iso, agora);
  const abs = horaCurta(iso, agora);
  return (
    <time dateTime={iso} title={fmtDataHora(iso)} className="whitespace-nowrap tabular-nums">
      {rel ? `${rel} · ${abs}` : abs}
    </time>
  );
}

function Titulo({ b, className }: { b: Boletim; className?: string }) {
  const url = urlSegura(b.url);
  if (!url) return <span className={className}>{b.titulo}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "rounded-sm hover:underline hover:decoration-zinc-400 hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500",
        className,
      )}
    >
      {b.titulo}
      <span className="sr-only"> (abre em nova aba, {b.fonteNome})</span>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="ml-1 inline-block h-3 w-3 -translate-y-px align-middle text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M6 3h7v7M13 3 6.5 9.5M11 9.5V13H3V5h3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function Chip({ children, cor, titulo }: { children: ReactNode; cor?: string; titulo?: string }) {
  return (
    <span
      title={titulo}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {cor && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cor }} />}
      {children}
    </span>
  );
}

function IconeLocal() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 text-zinc-500" fill="currentColor">
      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z" />
    </svg>
  );
}

const RE_CITA_BRASIL = /\b(?:brasil|pa[ií]s|nacional|tse)\b/i;

/**
 * Card de um boletim. TODOS os cards trazem o bloco de comparação, sem ação do usuário:
 * com números no texto → compara os números do boletim; sem números → compara os números oficiais
 * de agora do lugar citado (TSE ou boletins de urna do exterior) com 2022 e 2018.
 */
export default function BoletimCard({ b, agora }: { b: Boletim; agora: number }) {
  const n = b.extraido ?? {};
  const comNumeros = temNumeros(n);
  const apurado = n.pctApurado != null && Number.isFinite(n.pctApurado) ? n.pctApurado : null;
  const escopo = n.escopo ?? BRASIL;
  const exterior = ehExterior(escopo);
  const presumido = escopo.tipo === "br" && !RE_CITA_BRASIL.test(`${b.titulo} ${b.resumo ?? ""}`);

  return (
    <article
      className={cx(
        "rounded-xl border bg-white p-3 shadow-sm sm:p-4 dark:bg-zinc-900",
        exterior ? "border-sky-200 dark:border-sky-900/70" : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <FonteBadge fonte={b.fonte} nome={b.fonteNome} />
        <TipoTag tipo={b.tipo} />
        {exterior && (
          <span className="inline-block rounded border border-sky-200 bg-sky-50 px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300">
            Exterior
          </span>
        )}
        <span className="ml-auto">
          <Quando iso={b.publicadoEm} agora={agora} />
        </span>
      </header>

      <h3
        className={cx(
          "mt-2 leading-snug text-zinc-900 dark:text-zinc-50",
          comNumeros || n.vencedor ? "text-[15px] font-semibold sm:text-base" : "text-sm font-medium",
        )}
      >
        <Titulo b={b} />
      </h3>
      {b.resumo && <p className="mt-1 line-clamp-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">{b.resumo}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {apurado != null && <Chip titulo="% de urnas apuradas citado no boletim">{fmtPctLivre(apurado)} apurado</Chip>}
        {n.pt != null && Number.isFinite(n.pt) && (
          <Chip cor={BLOCOS.pt.cor} titulo="% dos votos válidos citado no boletim">
            Lula {fmtPctLivre(n.pt)}
          </Chip>
        )}
        {n.bolso != null && Number.isFinite(n.bolso) && (
          <Chip cor={BLOCOS.bolso.cor} titulo="% dos votos válidos citado no boletim">
            Flávio {fmtPctLivre(n.bolso)}
          </Chip>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
          <IconeLocal />
          {presumido ? "Brasil (presumido)" : escopo.nome}
        </span>
      </div>

      {comNumeros && b.tipo !== "apuracao" && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          {b.tipo === "boca-de-urna"
            ? "Boca de urna: estimativa de instituto, não é resultado da apuração."
            : b.tipo === "pesquisa"
              ? "Pesquisa de intenção de voto: não é resultado da apuração."
              : "Números extraídos automaticamente de uma notícia; confira no link."}
        </p>
      )}

      <ComparacaoBoletim
        className="mt-3"
        lazy
        pt={n.pt}
        bolso={n.bolso}
        pctApurado={apurado}
        vencedor={n.vencedor}
        escopo={escopo}
        escopoPresumido={presumido}
      />
    </article>
  );
}
