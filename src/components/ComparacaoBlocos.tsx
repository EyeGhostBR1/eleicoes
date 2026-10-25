// Dois cartões (Lula/Haddad × Flávio/Jair): 2026 ao vivo vs 2022 e 2018, + barras agrupadas.
import { BLOCOS } from "@/lib/config";
import { compararLive, margem, type LinhaComparacao } from "@/lib/compare";
import { fmtInt, fmtPP, fmtPct } from "@/lib/format";
import type { BlocoId, HistByYear, LiveResult, Turno } from "@/lib/types";
import { Card, DeltaPP, Dot, Skeleton, corTextoBloco, cx } from "./ui";

const BLOCOS_ORDEM: BlocoId[] = ["pt", "bolso"];

function nomeCurto(b: BlocoId, ano: "2026" | "2022" | "2018"): string {
  const n = BLOCOS[b].nomes[ano];
  return n.replace(" Bolsonaro", "");
}

function CartaoBloco({
  b,
  l,
  live,
  aguardando,
}: {
  b: BlocoId;
  l: LinhaComparacao;
  live: LiveResult | undefined;
  aguardando: boolean;
}) {
  const cand = live?.blocos?.[b];
  const cor = BLOCOS[b].cor;
  const tem26 = l.p2026 != null;
  const linhasHist: { ano: "2022" | "2018"; p: number | null; d: number | null; votos: number | null }[] = [
    { ano: "2022", p: l.p2022, d: l.d22, votos: l.votos2022 },
    { ano: "2018", p: l.p2018, d: l.d18, votos: l.votos2018 },
  ];
  return (
    <Card
      as="article"
      className="relative overflow-hidden p-4 sm:p-5"
      aria-label={`${BLOCOS[b].nomes["2026"]}: comparação com 2022 e 2018`}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-strong">
            <Dot cor={cor} />
            {BLOCOS[b].nomes["2026"]}
            {cand?.partido && <span className="text-sm font-normal text-muted">{cand.partido}</span>}
          </h3>
        </div>
        {cand?.situacao && cand.situacao !== "Não eleito" && (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${cor}22`, color: corTextoBloco(b) }}>
            {cand.situacao}
          </span>
        )}
      </div>

      <div className="mt-3">
        {tem26 ? (
          <>
            <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl" style={{ color: corTextoBloco(b) }}>
              {fmtPct(l.p2026)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {fmtInt(l.votos2026)} votos <span className="text-xs">· 2026{live && live.totais.pctTotalizado < 100 ? " (parcial)" : ""}</span>
            </p>
          </>
        ) : aguardando ? (
          <>
            <p className="text-4xl font-bold leading-none tracking-tight text-muted sm:text-5xl">—</p>
            <p className="mt-1 text-sm text-muted">2026: aguardando apuração</p>
          </>
        ) : (
          <>
            <Skeleton className="h-11 w-40" />
            <Skeleton className="mt-2 h-4 w-28" />
          </>
        )}
      </div>

      <dl className="mt-4 divide-y divide-line border-t border-line text-sm">
        {linhasHist.map((h) => (
          <div key={h.ano} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 py-2">
            <dt className="text-muted">
              <span className="font-medium text-fg">{h.ano}</span> ({nomeCurto(b, h.ano)})
            </dt>
            <dd className="font-semibold text-fg" title={h.votos != null ? `${fmtInt(h.votos)} votos` : undefined}>
              {fmtPct(h.p)}
            </dd>
            <dd className="min-w-[6.5rem] text-right">
              {tem26 ? <DeltaPP v={h.d} /> : <span className="text-xs text-muted">Δ aguardando</span>}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Barras agrupadas por ano (2018 / 2022 / 2026), um par de barras por ano. */
function EvolucaoBlocos({ linhas, parcial }: { linhas: Record<BlocoId, LinhaComparacao>; parcial: boolean }) {
  const anos: { ano: "2018" | "2022" | "2026"; k: "p2018" | "p2022" | "p2026" }[] = [
    { ano: "2018", k: "p2018" },
    { ano: "2022", k: "p2022" },
    { ano: "2026", k: "p2026" },
  ];
  const valores = anos.flatMap((a) => BLOCOS_ORDEM.map((b) => linhas[b][a.k] ?? 0));
  const escala = Math.max(60, Math.ceil(Math.max(...valores) / 10) * 10);
  return (
    <figure className="mt-1">
      <figcaption className="sr-only">Evolução do percentual de votos válidos por ano</figcaption>
      <div className="relative grid h-40 grid-cols-3 gap-3 border-b border-line sm:gap-6">
        {[50].map((g) => (
          <div
            key={g}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
            style={{ bottom: `${(g / escala) * 85}%` }}
          >
            <span className="absolute -top-2.5 right-0 bg-surface px-1 text-[10px] text-muted">50%</span>
          </div>
        ))}
        {anos.map((a) => (
          <div key={a.ano} className="flex items-end justify-center gap-1.5 sm:gap-2">
            {BLOCOS_ORDEM.map((b) => {
              const v = linhas[b][a.k];
              const nome = a.ano === "2026" ? BLOCOS[b].nomes["2026"] : BLOCOS[b].nomes[a.ano];
              return (
                <div key={b} className="flex h-full w-8 flex-col items-center justify-end sm:w-12">
                  <span className="mb-0.5 text-[11px] font-semibold text-fg sm:text-xs">{v == null ? "—" : fmtPct(v, 1)}</span>
                  <div
                    role="img"
                    aria-label={`${nome} ${a.ano}: ${v == null ? "sem dados" : fmtPct(v, 1)}`}
                    className={cx("w-full rounded-t-sm", v == null && "border border-dashed border-line")}
                    style={{
                      height: v == null ? "4px" : `${Math.max(1, (v / escala) * 85)}%`,
                      background: v == null ? "transparent" : BLOCOS[b].cor,
                      opacity: a.ano === "2026" ? 1 : a.ano === "2022" ? 0.75 : 0.5,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-3 text-center text-xs text-muted sm:gap-6">
        {anos.map((a) => (
          <span key={a.ano}>
            <span className="font-semibold text-fg">{a.ano}</span>
            {a.ano === "2026" && parcial ? " (parcial)" : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}

function textoMargem(m: number | null, ano: "2026" | "2022" | "2018"): string {
  if (m == null) return "—";
  if (Math.abs(m) < 0.005) return "empate";
  const quem = m > 0 ? nomeCurto("pt", ano) : nomeCurto("bolso", ano);
  return `${quem} por ${fmtPP(Math.abs(m)).replace("+", "")}`;
}

export default function ComparacaoBlocos({
  live,
  hist,
  turno,
  carregando,
  titulo,
}: {
  /** resultado ao vivo do lugar (undefined = ainda não há/carregando) */
  live: LiveResult | undefined;
  hist: HistByYear | null | undefined;
  turno: Turno;
  /** true enquanto a primeira resposta do TSE não chegou */
  carregando?: boolean;
  titulo?: string;
}) {
  const linhas = {
    pt: compararLive("pt", live, hist, turno),
    bolso: compararLive("bolso", live, hist, turno),
  } satisfies Record<BlocoId, LinhaComparacao>;
  const aguardando = !carregando;
  const m26 = margem(linhas.pt.p2026, linhas.bolso.p2026);
  const m22 = margem(linhas.pt.p2022, linhas.bolso.p2022);
  const m18 = margem(linhas.pt.p2018, linhas.bolso.p2018);
  const semMapeamento = live && live.candidatos.length > 0 && (!live.blocos?.pt || !live.blocos?.bolso);

  return (
    <section aria-labelledby="comp-blocos" className="space-y-3">
      <h2 id="comp-blocos" className="sr-only">
        {titulo ?? "Comparação Lula × Flávio com 2022 e 2018"}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BLOCOS_ORDEM.map((b) => (
          <CartaoBloco key={b} b={b} l={linhas[b]} live={live} aguardando={aguardando} />
        ))}
      </div>
      {semMapeamento && (
        <p className="text-xs text-muted">
          Não foi possível identificar {!live?.blocos?.pt ? "Lula" : "Flávio"} entre os candidatos deste resultado.
        </p>
      )}
      <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-center">
        <div className="space-y-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Vantagem ({turno}º turno)</p>
          <p className="text-lg font-semibold text-strong">
            2026: {m26 == null ? <span className="text-muted">{aguardando ? "aguardando" : "—"}</span> : textoMargem(m26, "2026")}
          </p>
          <p className="text-muted">
            2022: <span className="font-medium text-fg">{textoMargem(m22, "2022")}</span>
          </p>
          <p className="text-muted">
            2018: <span className="font-medium text-fg">{textoMargem(m18, "2018")}</span>
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Dot cor={BLOCOS.pt.cor} /> Lula / Haddad
            </span>
            <span className="inline-flex items-center gap-1">
              <Dot cor={BLOCOS.bolso.cor} /> Flávio / Jair
            </span>
          </p>
        </div>
        <EvolucaoBlocos linhas={linhas} parcial={!!live && live.totais.pctTotalizado < 100} />
      </Card>
    </section>
  );
}
