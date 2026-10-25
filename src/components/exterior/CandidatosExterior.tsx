// Todos os candidatos no exterior (boletins recebidos): barras com % dos válidos e votos.
import { BLOCOS, COR_OUTROS } from "@/lib/config";
import { pct } from "@/lib/compare";
import { fmtInt, fmtPct } from "@/lib/format";
import type { ExtAgregado, ExteriorResponse } from "@/lib/types";
import { Card, SectionTitle, cx } from "../ui";
import { candidatosOrdenados } from "./dados";

export default function CandidatosExterior({
  ag,
  candidatos,
  titulo = "Todos os candidatos no exterior",
}: {
  ag: ExtAgregado;
  candidatos: ExteriorResponse["candidatos"] | undefined;
  titulo?: string;
}) {
  const lista = candidatosOrdenados(ag, candidatos);
  const max = Math.max(10, ...lista.map((c) => c.pct ?? 0));
  const escala = Math.min(100, max);
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle sub="Seções com boletim recebido · % dos votos válidos">{titulo}</SectionTitle>
      {lista.length === 0 ? (
        <p className="text-sm text-muted">Sem votos nos boletins recebidos.</p>
      ) : (
        <ol className="space-y-2" aria-label="Candidatos ordenados por votos no exterior">
          {lista.map((c) => {
            const cor = c.bloco ? BLOCOS[c.bloco].cor : COR_OUTROS;
            return (
              <li
                key={c.n}
                className="rounded-lg px-2 py-1"
                style={c.bloco ? { background: `${cor}14`, boxShadow: `inset 0 0 0 1px ${cor}55` } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className={cx("font-semibold", c.bloco ? "text-strong" : "text-fg")}>{c.nome}</span>{" "}
                    <span className="text-xs text-muted">
                      {c.partido ? `${c.partido} · ` : ""}
                      {c.n}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-semibold text-strong">{fmtPct(c.pct)}</span>
                    <span className="ml-2 text-xs text-muted">{fmtInt(c.votos)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${((c.pct ?? 0) / escala) * 100}%`, background: cor }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted sm:grid-cols-4">
        <div>
          <dt>Válidos</dt>
          <dd className="font-medium text-fg">{fmtInt(ag.validos)}</dd>
        </div>
        <div>
          <dt>Brancos</dt>
          <dd className="font-medium text-fg">
            {fmtInt(ag.brancos)} <span className="font-normal text-muted">({fmtPct(pct(ag.brancos, ag.comparecimento), 1)})</span>
          </dd>
        </div>
        <div>
          <dt>Nulos</dt>
          <dd className="font-medium text-fg">
            {fmtInt(ag.nulos)} <span className="font-normal text-muted">({fmtPct(pct(ag.nulos, ag.comparecimento), 1)})</span>
          </dd>
        </div>
        <div>
          <dt>Comparecimento</dt>
          <dd className="font-medium text-fg">
            {fmtInt(ag.comparecimento)}{" "}
            <span className="font-normal text-muted">({fmtPct(pct(ag.comparecimento, ag.aptos), 1)} dos aptos)</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
