"use client";
// Cartão das páginas de cidade do exterior (/cidade/zz/{cd}): boletins de urna já recebidos
// nesta cidade, comparados com a própria cidade em 2022 e 2018.
import Link from "next/link";
import { useParamsState } from "@/lib/client/hooks";
import { fmtInt, fmtPct } from "@/lib/format";
import type { HistByYear } from "@/lib/types";
import { Card, DeltaPP } from "../ui";
import { useExteriorOk } from "../useDados";
import { linhaDe } from "./dados";
import { Bandeira, MiniProgresso } from "./partes";

export default function CardCidadeExterior({ cd, hist }: { cd: string; hist: HistByYear | null | undefined }) {
  const { turno, qs } = useParamsState();
  const { data } = useExteriorOk();
  const c = data?.cidades?.[cd];
  if (!data || !c) return null;
  const l = linhaDe({ id: cd, tipo: "cidade", nome: c.nome, ag: c, hist, turno, candidatos: data.candidatos });
  const iso2 = data.paises?.[c.pais]?.iso2;
  return (
    <Card className="p-4" aria-label="Boletins de urna recebidos nesta cidade">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-strong">Boletins de urna já recebidos</p>
          <p className="text-xs text-muted">Publicados pelo TSE antes da totalização · parcial</p>
        </div>
        <Link href={`/exterior${qs}`} className="inline-flex items-center gap-1 text-sm font-medium text-strong underline underline-offset-2">
          <Bandeira iso2={iso2} />
          {c.pais}: todos os países →
        </Link>
      </div>
      <div className="mt-2 max-w-xs">
        <p className="text-xs text-muted">
          {fmtInt(c.secoesRecebidas)} de {fmtInt(c.secoesTotal)} seções recebidas
        </p>
        <MiniProgresso v={l.pa} className="mt-1" />
      </div>
      {l.validos ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <p>
            <span className="text-muted">Lula </span>
            <span className="text-lg font-bold" style={{ color: "var(--c-pt)" }}>
              {fmtPct(l.pt.p2026, 1)}
            </span>{" "}
            <span className="text-xs">
              <DeltaPP v={l.pt.d22} /> <span className="text-muted">vs 2022</span>
            </span>
          </p>
          <p>
            <span className="text-muted">Flávio </span>
            <span className="text-lg font-bold" style={{ color: "var(--c-bolso)" }}>
              {fmtPct(l.bo.p2026, 1)}
            </span>{" "}
            <span className="text-xs">
              <DeltaPP v={l.bo.d22} /> <span className="text-muted">vs Jair 2022</span>
            </span>
          </p>
          <p className="text-xs text-muted self-center">{fmtInt(l.validos)} votos válidos</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Nenhum voto válido recebido ainda nesta cidade.</p>
      )}
    </Card>
  );
}
