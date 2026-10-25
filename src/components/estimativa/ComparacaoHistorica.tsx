// Estimativa final de 2026 × resultados FINAIS de 2022 (Lula × Jair) e 2018 (Haddad × Jair):
// cartões com Δ p.p. + barras agrupadas por ano (mesma linguagem visual de ComparacaoBlocos).
import { BLOCOS } from "@/lib/config";
import { fmtPct } from "@/lib/format";
import type { BlocoId, Turno } from "@/lib/types";
import { Card, DeltaPP, Dot, corTextoBloco, cx } from "../ui";
import { BLOCOS_ORDEM, dif, nomeAno, textoMargem } from "./util";

export type ParBlocos = { pt: number | null; bolso: number | null };

type Ano = "2018" | "2022" | "2026";

function Barras({ valores, estimado }: { valores: Record<Ano, ParBlocos>; estimado: boolean }) {
  const anos: Ano[] = ["2018", "2022", "2026"];
  const todos = anos.flatMap((a) => BLOCOS_ORDEM.map((b) => valores[a][b] ?? 0));
  const escala = Math.max(60, Math.ceil(Math.max(...todos) / 10) * 10);
  return (
    <figure className="mt-1">
      <figcaption className="sr-only">
        Percentual dos votos válidos por ano: 2018 e 2022 finais, 2026 {estimado ? "estimado" : "aguardando apuração"}.
      </figcaption>
      <div className="relative grid h-40 grid-cols-3 gap-3 border-b border-line sm:gap-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
          style={{ bottom: `${(50 / escala) * 85}%` }}
        >
          <span className="absolute -top-2.5 right-0 bg-surface px-1 text-[10px] text-muted">50%</span>
        </div>
        {anos.map((a) => (
          <div key={a} className="flex items-end justify-center gap-1.5 sm:gap-2">
            {BLOCOS_ORDEM.map((b) => {
              const v = valores[a][b];
              const est = a === "2026";
              return (
                <div key={b} className="flex h-full w-8 flex-col items-center justify-end sm:w-12">
                  <span className="mb-0.5 text-[11px] font-semibold text-fg sm:text-xs">{v == null ? "—" : fmtPct(v, 1)}</span>
                  <div
                    role="img"
                    aria-label={`${nomeAno(b, a)} ${a}${est ? " (estimativa)" : ""}: ${v == null ? "sem dados" : fmtPct(v, 1)}`}
                    className={cx("w-full rounded-t-sm", v == null && "border border-dashed border-line")}
                    style={{
                      height: v == null ? "4px" : `${Math.max(1, (v / escala) * 85)}%`,
                      backgroundColor: v == null ? "transparent" : BLOCOS[b].cor,
                      // textura diagonal = valor estimado (não é resultado apurado)
                      backgroundImage:
                        v != null && est
                          ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.32) 0 3px, transparent 3px 7px)"
                          : undefined,
                      opacity: est ? 1 : a === "2022" ? 0.75 : 0.5,
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
          <span key={a}>
            <span className="font-semibold text-fg">{a}</span>
            {a === "2026" ? " (estimativa)" : " (final)"}
          </span>
        ))}
      </div>
    </figure>
  );
}

function CartaoBloco({ b, est, f22, f18 }: { b: BlocoId; est: number | null; f22: number | null; f18: number | null }) {
  const linhas: { ano: "2022" | "2018"; p: number | null }[] = [
    { ano: "2022", p: f22 },
    { ano: "2018", p: f18 },
  ];
  return (
    <div className="relative overflow-hidden rounded-lg border border-line p-3">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: BLOCOS[b].cor }} />
      <p className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Dot cor={BLOCOS[b].cor} />
        {BLOCOS[b].nomes["2026"]} <span className="font-normal text-muted">estimativa</span>
      </p>
      <p className="mt-1 text-3xl font-bold leading-none tracking-tight" style={{ color: est != null ? corTextoBloco(b) : undefined }}>
        {est == null ? <span className="text-muted">—</span> : fmtPct(est, 1)}
      </p>
      <dl className="mt-3 divide-y divide-line border-t border-line text-sm">
        {linhas.map((h) => (
          <div key={h.ano} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 py-1.5">
            <dt className="text-muted">
              <span className="font-medium text-fg">{h.ano}</span> ({nomeAno(b, h.ano)}, final)
            </dt>
            <dd className="font-semibold text-fg">{fmtPct(h.p, 1)}</dd>
            <dd className="min-w-[5.5rem] text-right">
              {est != null ? <DeltaPP v={dif(est, h.p)} /> : <span className="text-xs text-muted">Δ aguardando</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ComparacaoHistorica({
  est,
  f22,
  f18,
  turno,
}: {
  /** estimativa final 2026 (null antes da apuração) */
  est: ParBlocos | null;
  f22: ParBlocos;
  f18: ParBlocos;
  turno: Turno;
}) {
  const e = est ?? { pt: null, bolso: null };
  const m26 = dif(e.pt, e.bolso);
  const m22 = dif(f22.pt, f22.bolso);
  const m18 = dif(f18.pt, f18.bolso);
  return (
    <Card className="p-4" aria-labelledby="sec-hist-est">
      <h2 id="sec-hist-est" className="text-base font-semibold text-strong">
        Comparação histórica ({turno}º turno)
      </h2>
      <p className="mt-0.5 text-sm text-muted">
        {est ? "Estimativa final de 2026 contra os resultados finais" : "Resultados finais"} de 2022 (Lula × Jair) e 2018
        (Haddad × Jair).
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BLOCOS_ORDEM.map((b) => (
          <CartaoBloco key={b} b={b} est={e[b]} f22={f22[b]} f18={f18[b]} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center">
        <div className="space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Vantagem</p>
          <p className="font-semibold text-strong">
            2026 (est.): {m26 == null ? <span className="font-normal text-muted">aguardando</span> : textoMargem(m26, "2026")}
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
        <Barras valores={{ "2018": f18, "2022": f22, "2026": e }} estimado={!!est} />
      </div>
    </Card>
  );
}
