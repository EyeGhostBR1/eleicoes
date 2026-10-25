// Todos os candidatos de 2026 com barras horizontais, % e votos; destaca os blocos mapeados.
import { BLOCOS, COR_OUTROS } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import type { BlocoId, LiveResult } from "@/lib/types";
import { Badge, Card, SectionTitle, SkeletonLinhas, cx } from "./ui";

function blocoDe(live: LiveResult, n: string): BlocoId | null {
  if (live.blocos?.pt?.n === n) return "pt";
  if (live.blocos?.bolso?.n === n) return "bolso";
  return null;
}

export default function TabelaCandidatos({
  live,
  carregando,
}: {
  live: LiveResult | undefined;
  carregando?: boolean;
}) {
  return (
    <Card className="p-4">
      <SectionTitle sub="Percentual sobre votos válidos — 2026">Candidatos</SectionTitle>
      {!live ? (
        carregando ? (
          <SkeletonLinhas n={6} />
        ) : (
          <p className="text-sm text-muted">Aguardando apuração.</p>
        )
      ) : live.candidatos.length === 0 ? (
        <p className="text-sm text-muted">Sem candidatos neste resultado.</p>
      ) : (
        <Lista live={live} />
      )}
    </Card>
  );
}

function Lista({ live }: { live: LiveResult }) {
  const max = Math.max(1, ...live.candidatos.map((c) => (isFinite(c.pct) ? c.pct : 0)));
  const escala = Math.min(100, Math.max(max, 10));
  return (
    <ol className="space-y-2.5" aria-label="Candidatos ordenados por votos">
      {live.candidatos.map((c, i) => {
        const b = blocoDe(live, c.n);
        const cor = b ? BLOCOS[b].cor : COR_OUTROS;
        const anulado = c.destinacao && !/^v[aá]lido/i.test(c.destinacao);
        const pctV = isFinite(c.pct) ? c.pct : null;
        return (
          <li
            key={`${c.n}-${i}`}
            className="rounded-lg px-2 py-1.5"
            style={b ? { background: `${cor}14`, boxShadow: `inset 0 0 0 1px ${cor}55` } : undefined}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className={cx("font-semibold", b ? "text-strong" : "text-fg")}>{c.nome}</span>{" "}
                <span className="text-xs text-muted">
                  {c.partido} · {c.n}
                </span>
                {b && (
                  <span className="ml-1.5 text-xs font-medium" style={{ color: b === "pt" ? "var(--c-pt)" : "var(--c-bolso)" }}>
                    ({BLOCOS[b].rotulo})
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="font-semibold text-strong">{fmtPct(pctV)}</span>
                <span className="ml-2 hidden text-xs text-muted sm:inline">{fmtInt(c.votos)} votos</span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${((pctV ?? 0) / escala) * 100}%`, background: cor }} />
              </div>
              <span className="text-xs text-muted sm:hidden">{fmtInt(c.votos)}</span>
            </div>
            {(c.situacao && c.situacao !== "Não eleito") || anulado ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {c.situacao && c.situacao !== "Não eleito" && <Badge tom={c.eleito ? "ok" : "neutro"}>{c.situacao}</Badge>}
                {anulado && <Badge tom="aviso">Destinação: {c.destinacao}</Badge>}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
