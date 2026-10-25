// "Se a apuração terminasse agora…": estimativa nacional (cenário base2022) em destaque,
// faixa (intervalo) em barra, parcial de agora para contraste e leitura 1º/2º turno.
import { BLOCOS } from "@/lib/config";
import { fmtDataHora, fmtInt, fmtPct } from "@/lib/format";
import type { BlocoId, EstimativaResponse, Turno } from "@/lib/types";
import { Card, DeltaPP, Dot, corTextoBloco, cx } from "../ui";
import {
  BLOCOS_ORDEM,
  NOME_26,
  POUCO_APURADO,
  type Veredito,
  calcularVeredito,
  dif,
  dominioPct,
  escala,
  faixaDe,
} from "./util";

const ESTILO_VEREDITO: Record<Veredito["tom"], string> = {
  pt: "border-pt/40 bg-pt/10",
  bolso: "border-bolso/40 bg-bolso/10",
  neutro: "border-line bg-surface-2",
  aviso: "border-transparent bg-warn-bg text-warn-fg",
};

function CaixaVeredito({ v, turno }: { v: Veredito; turno: Turno }) {
  return (
    <div role="status" className={cx("rounded-lg border px-3 py-2.5", ESTILO_VEREDITO[v.tom])}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        {turno === 1 ? "Lula acima de 50%?" : "Quem venceria?"}
      </p>
      <p
        className="text-lg font-bold leading-snug"
        style={v.tom === "pt" || v.tom === "bolso" ? { color: corTextoBloco(v.tom) } : undefined}
      >
        {v.tom === "aviso" ? "⚠ " : ""}
        {v.titulo}
      </p>
      <p className={cx("mt-0.5 text-sm", v.tom === "aviso" ? "" : "text-muted")}>{v.detalhe}</p>
    </div>
  );
}

/** Barra horizontal com a faixa de cada candidato, a estimativa (traço) e o parcial (círculo). */
function BarraFaixas({ r }: { r: EstimativaResponse }) {
  const br = r.br!;
  const linhas = BLOCOS_ORDEM.map((b) => ({
    b,
    est: br.cenarios.base2022[b].pct,
    faixa: faixaDe(r, b),
    parcial: br.parcial[b],
  }));
  const [d0, d1] = dominioPct(
    linhas.flatMap((l) => [l.est, l.parcial, l.faixa?.[0], l.faixa?.[1]]),
    5,
    3,
    50,
  );
  const x = escala(d0, d1, 0, 100);
  const passo = d1 - d0 > 40 ? 10 : 5;
  const ticks: number[] = [];
  for (let v = Math.ceil(d0 / passo) * passo; v <= d1; v += passo) ticks.push(v);
  const pos = (v: number) => `${Math.min(100, Math.max(0, x(v)))}%`;

  return (
    <figure className="mt-1">
      <figcaption className="sr-only">
        Faixa estimada de cada candidato em % dos votos válidos, com a estimativa central e o parcial atual.
      </figcaption>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-3">
        {linhas.map((l) => (
          <div key={l.b} className="contents">
            <span className="text-xs font-semibold" style={{ color: corTextoBloco(l.b) }}>
              {NOME_26[l.b]}
            </span>
            <div
              className="relative h-7"
              role="img"
              aria-label={`${NOME_26[l.b]}: estimativa ${fmtPct(l.est, 1)}${
                l.faixa ? `, faixa de ${fmtPct(l.faixa[0], 1)} a ${fmtPct(l.faixa[1], 1)}` : ""
              }${l.parcial != null ? `, parcial agora ${fmtPct(l.parcial, 1)}` : ""}`}
            >
              <div aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2" />
              <div aria-hidden className="absolute -inset-y-1.5 border-l border-dashed border-fg/50" style={{ left: pos(50) }} />
              {l.faixa && (
                <div
                  aria-hidden
                  className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm"
                  style={{
                    left: pos(l.faixa[0]),
                    width: `max(4px, calc(${pos(l.faixa[1])} - ${pos(l.faixa[0])}))`,
                    background: corTextoBloco(l.b),
                    opacity: 0.3,
                  }}
                />
              )}
              {l.parcial != null && (
                <div
                  aria-hidden
                  title={`Parcial agora: ${fmtPct(l.parcial, 1)}`}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
                  style={{ left: pos(l.parcial), borderColor: corTextoBloco(l.b) }}
                />
              )}
              <div
                aria-hidden
                title={`Estimativa: ${fmtPct(l.est, 1)}`}
                className="absolute top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                style={{ left: pos(l.est), background: corTextoBloco(l.b) }}
              />
            </div>
          </div>
        ))}
        {/* eixo */}
        <span />
        <div aria-hidden className="relative -mt-1 h-4 text-[10px] text-muted">
          {ticks.map((t) => (
            <span
              key={t}
              className={cx("absolute -translate-x-1/2 tabular-nums", t === 50 && "font-semibold text-fg")}
              style={{ left: pos(t) }}
            >
              {t}%
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3.5 w-[3px] rounded-full bg-fg" /> estimativa
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-5 rounded-sm bg-fg/25" /> faixa provável
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-fg bg-surface" /> parcial agora
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 border-l border-dashed border-fg" /> 50% dos válidos
        </span>
      </p>
    </figure>
  );
}

function CartaoCandidato({ b, r }: { b: BlocoId; r: EstimativaResponse }) {
  const br = r.br!;
  const est = br.cenarios.base2022[b];
  const f = faixaDe(r, b);
  const parcial = br.parcial[b];
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface p-3 sm:p-4">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: BLOCOS[b].cor }} />
      <p className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Dot cor={BLOCOS[b].cor} />
        {BLOCOS[b].nomes["2026"]}
      </p>
      <p
        className="mt-2 text-4xl font-bold leading-none tracking-tight sm:text-5xl"
        style={{ color: corTextoBloco(b) }}
        aria-label={`${NOME_26[b]}: estimativa final ${fmtPct(est.pct, 1)} dos votos válidos`}
      >
        {fmtPct(est.pct, 1)}
      </p>
      <p className="mt-1 text-sm text-muted">
        {f ? (
          <>
            faixa <span className="font-medium text-fg">{fmtPct(f[0], 1)}</span> a{" "}
            <span className="font-medium text-fg">{fmtPct(f[1], 1)}</span>
          </>
        ) : (
          "faixa indisponível"
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted" title={`${fmtInt(est.votos)} votos estimados`}>
        ≈ {fmtInt(Math.round(est.votos))} votos
      </p>
      <dl className="mt-3 flex items-baseline justify-between gap-2 border-t border-line pt-2 text-sm">
        <dt className="text-muted">Parcial agora</dt>
        <dd className="flex items-baseline gap-2">
          <span className="font-semibold text-fg">{fmtPct(parcial, 1)}</span>
          <span className="text-xs" title="Diferença entre a estimativa final e o parcial atual">
            <DeltaPP v={dif(est.pct, parcial)} />
          </span>
        </dd>
      </dl>
    </div>
  );
}

export default function HeroEstimativa({ r, turno }: { r: EstimativaResponse; turno: Turno }) {
  const br = r.br;
  if (!r.disponivel || !br) return null;
  const veredito = calcularVeredito(r, turno);
  const outros = br.cenarios.base2022.outros;
  const pa = br.pctTotalizado;

  return (
    <Card className="p-4 sm:p-5" aria-labelledby="hero-estimativa">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="hero-estimativa" className="text-xl font-bold tracking-tight text-strong sm:text-2xl">
            Se a apuração terminasse agora…
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Estimativa do resultado final ({turno}º turno, % dos votos válidos) com{" "}
            <span className="font-semibold text-fg">{fmtPct(pa, 2)}</span> das seções apuradas · TSE{" "}
            {fmtDataHora(r.atualizadoEm)}
          </p>
        </div>
      </div>

      {pa < POUCO_APURADO && (
        <p className="mt-3 rounded-lg border border-transparent bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <span aria-hidden>⚠ </span>
          Com menos de {POUCO_APURADO}% das seções apuradas a estimativa ainda é muito instável — as primeiras urnas não
          representam bem o país.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BLOCOS_ORDEM.map((b) => (
          <CartaoCandidato key={b} b={b} r={r} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <BarraFaixas r={r} />
          {turno === 1 && (
            <p className="mt-2 text-sm text-muted">
              Outros candidatos (estimativa):{" "}
              <span className="font-semibold text-fg">{fmtPct(outros.pct, 1)}</span>
            </p>
          )}
        </div>
        {veredito && <CaixaVeredito v={veredito} turno={turno} />}
      </div>
    </Card>
  );
}
