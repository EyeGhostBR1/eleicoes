"use client";
// "Evolução da noite": estimativa final (linha cheia + faixa) × parcial apurado (tracejado)
// conforme o % apurado avança. Pontos acumulados no navegador (ver historico.ts).
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { fmtHora, fmtPct } from "@/lib/format";
import type { BlocoId, Turno } from "@/lib/types";
import { cx } from "../ui";
import type { PontoEvolucao } from "./historico";
import { NOME_26, escala } from "./util";

const ALTURA = 260;
const M = { t: 12, r: 84, b: 28, l: 40 };

const COR: Record<BlocoId, string> = { pt: "var(--c-pt)", bolso: "var(--c-bolso)" };

interface Serie {
  b: BlocoId;
  tipo: "est" | "par";
  get: (p: PontoEvolucao) => number | null;
}

const SERIES: Serie[] = [
  { b: "pt", tipo: "est", get: (p) => p.ePt },
  { b: "pt", tipo: "par", get: (p) => p.pPt },
  { b: "bolso", tipo: "est", get: (p) => p.eBo },
  { b: "bolso", tipo: "par", get: (p) => p.pBo },
];

const BANDAS: { b: BlocoId; get: (p: PontoEvolucao) => [number, number] | null }[] = [
  { b: "pt", get: (p) => p.iPt },
  { b: "bolso", get: (p) => p.iBo },
];

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => {
      const nw = Math.round(es[0]?.contentRect.width ?? 0);
      setW((v) => (v === nw ? v : nw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type Esc = (v: number) => number;

function caminhoLinha(pts: PontoEvolucao[], get: Serie["get"], x: Esc, y: Esc): string {
  let d = "";
  let caneta = false;
  for (const p of pts) {
    const v = get(p);
    if (v == null) {
      caneta = false;
      continue;
    }
    d += `${caneta ? "L" : "M"}${x(p.pa).toFixed(1)},${y(v).toFixed(1)}`;
    caneta = true;
  }
  return d;
}

function caminhoBanda(pts: PontoEvolucao[], get: (p: PontoEvolucao) => [number, number] | null, x: Esc, y: Esc): string {
  let d = "";
  let seg: [number, number, number][] = [];
  const fechar = () => {
    if (seg.length >= 2) {
      const sup = seg.map((s) => `${x(s[0]).toFixed(1)},${y(s[2]).toFixed(1)}`).join("L");
      const inf = seg
        .slice()
        .reverse()
        .map((s) => `${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`)
        .join("L");
      d += `M${sup}L${inf}Z`;
    }
    seg = [];
  };
  for (const p of pts) {
    const f = get(p);
    if (!f) {
      fechar();
      continue;
    }
    seg.push([p.pa, f[0], f[1]]);
  }
  fechar();
  return d;
}

function ultimo(pts: PontoEvolucao[], get: Serie["get"]): { p: PontoEvolucao; v: number } | null {
  for (let i = pts.length - 1; i >= 0; i--) {
    const v = get(pts[i]);
    if (v != null) return { p: pts[i], v };
  }
  return null;
}

function Legenda() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden width="22" height="8">
          <line x1="1" y1="4" x2="21" y2="4" style={{ stroke: "var(--fg)", strokeWidth: 2 }} />
        </svg>
        estimativa final
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden width="22" height="8">
          <line x1="1" y1="4" x2="21" y2="4" style={{ stroke: "var(--fg)", strokeWidth: 2, strokeDasharray: "4 3" }} />
        </svg>
        parcial apurado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-5 rounded-sm bg-fg/20" /> faixa provável
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-pt" /> Lula
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-bolso" /> Flávio
      </span>
    </p>
  );
}

export default function GraficoEvolucao({
  pontos,
  turno,
  onLimpar,
  demo,
}: {
  pontos: PontoEvolucao[];
  turno: Turno;
  onLimpar?: () => void;
  /** série fictícia (modo demonstração) */
  demo?: boolean;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);

  const ord = useMemo(
    () => pontos.slice().sort((a, b) => a.pa - b.pa || Date.parse(a.t) - Date.parse(b.t)),
    [pontos],
  );

  const g = useMemo(() => {
    if (ord.length < 2 || largura <= 0) return null;
    const W = largura;
    const pas = ord.map((p) => p.pa);
    const x0 = Math.max(0, Math.floor(Math.min(...pas) / 10) * 10);
    const x1 = Math.min(100, Math.max(x0 + 10, Math.ceil((Math.max(...pas) + 2) / 10) * 10));
    const vals: number[] = [];
    for (const p of ord) {
      for (const s of SERIES) {
        const v = s.get(p);
        if (v != null) vals.push(v);
      }
      for (const bd of BANDAS) {
        const f = bd.get(p);
        if (f) vals.push(f[0], f[1]);
      }
    }
    if (!vals.length) return null;
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (50 >= lo - 6 && 50 <= hi + 6) {
      lo = Math.min(lo, 50);
      hi = Math.max(hi, 50);
    }
    const faixaY = hi - lo;
    const passoY = faixaY > 30 ? 10 : faixaY > 10 ? 5 : 2;
    const y0 = Math.max(0, Math.floor((lo - 1) / passoY) * passoY);
    const y1 = Math.min(100, Math.ceil((hi + 1) / passoY) * passoY);
    const x = escala(x0, x1, M.l, W - M.r);
    const y = escala(y0, y1, ALTURA - M.b, M.t);
    const ticksY: number[] = [];
    for (let v = y0; v <= y1 + 1e-9; v += passoY) ticksY.push(v);
    const passoX = x1 - x0 >= 40 ? 10 : 5;
    const ticksX: number[] = [];
    for (let v = x0; v <= x1 + 1e-9; v += passoX) ticksX.push(v);

    // rótulos diretos das estimativas no fim das linhas (afastados se colidirem)
    const rot = (["pt", "bolso"] as BlocoId[])
      .map((b) => {
        const u = ultimo(ord, b === "pt" ? (p) => p.ePt : (p) => p.eBo);
        return u ? { b, v: u.v, yy: y(u.v), xx: x(u.p.pa) } : null;
      })
      .filter((r): r is { b: BlocoId; v: number; yy: number; xx: number } => r != null)
      .sort((a, b) => a.yy - b.yy);
    if (rot.length === 2 && rot[1].yy - rot[0].yy < 14) {
      const meio = (rot[0].yy + rot[1].yy) / 2;
      rot[0].yy = meio - 7;
      rot[1].yy = meio + 7;
    }
    return { W, x, y, x0, x1, ticksX, ticksY, rot };
  }, [ord, largura]);

  const idxAtivo = ativo != null && ativo < ord.length ? ativo : null;
  const pAtivo = idxAtivo != null ? ord[idxAtivo] : null;

  function mover(e: PointerEvent<SVGRectElement>) {
    if (!g) return;
    const r = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = e.clientX - r.left;
    let melhor = 0;
    let dist = Infinity;
    ord.forEach((p, i) => {
      const d = Math.abs(g.x(p.pa) - px);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    setAtivo(melhor);
  }

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    if (!ord.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const d = e.key === "ArrowRight" ? 1 : -1;
      setAtivo((a) => Math.min(ord.length - 1, Math.max(0, (a ?? (d > 0 ? -1 : ord.length)) + d)));
    } else if (e.key === "Escape") {
      setAtivo(null);
    }
  }

  const ultimoPonto = ord[ord.length - 1];
  const resumo = ultimoPonto
    ? `Evolução da estimativa e do parcial: ${ord.length} atualizações, de ${fmtPct(ord[0].pa, 1)} a ${fmtPct(
        ultimoPonto.pa,
        1,
      )} apurado. Última: estimativa Lula ${fmtPct(ultimoPonto.ePt, 1)}, Flávio ${fmtPct(ultimoPonto.eBo, 1)}; parcial Lula ${fmtPct(
        ultimoPonto.pPt,
        1,
      )}, Flávio ${fmtPct(ultimoPonto.pBo, 1)}.`
    : "Sem pontos ainda.";

  return (
    <div className="space-y-2">
      <Legenda />
      <div
        ref={ref}
        className="relative w-full rounded-md focus-visible:outline-2"
        tabIndex={ord.length >= 2 ? 0 : undefined}
        role={ord.length >= 2 ? "img" : undefined}
        aria-label={ord.length >= 2 ? `${resumo} Use as setas para percorrer os pontos.` : undefined}
        onKeyDown={teclado}
        onBlur={() => setAtivo(null)}
        style={{ minHeight: ALTURA }}
      >
        {ord.length < 2 ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
            <p className="font-medium text-fg">O gráfico se forma ao longo da noite.</p>
            <p>
              A cada atualização do TSE (cerca de 30 s) um novo ponto é guardado neste navegador. Mantenha a página aberta
              {ord.length === 1 ? ` — 1 ponto registrado (${fmtPct(ord[0].pa, 1)} apurado).` : "."}
            </p>
          </div>
        ) : g ? (
          <>
            <svg width={g.W} height={ALTURA} className="block" aria-hidden>
              {/* grade */}
              {g.ticksY.map((v) => (
                <g key={`y${v}`}>
                  <line
                    x1={M.l}
                    x2={g.W - M.r}
                    y1={g.y(v)}
                    y2={g.y(v)}
                    style={{
                      stroke: v === 50 ? "var(--muted)" : "var(--line)",
                      strokeWidth: 1,
                      strokeDasharray: v === 50 ? "4 3" : undefined,
                    }}
                  />
                  <text
                    x={M.l - 6}
                    y={g.y(v)}
                    dy="0.32em"
                    textAnchor="end"
                    style={{ fill: v === 50 ? "var(--fg)" : "var(--muted)", fontSize: 11, fontWeight: v === 50 ? 600 : 400 }}
                  >
                    {v}%
                  </text>
                </g>
              ))}
              {g.ticksX.map((v) => (
                <text
                  key={`x${v}`}
                  x={g.x(v)}
                  y={ALTURA - M.b + 16}
                  textAnchor="middle"
                  style={{ fill: "var(--muted)", fontSize: 11 }}
                >
                  {v}%
                </text>
              ))}
              <text
                x={g.W - M.r}
                y={ALTURA - 2}
                textAnchor="end"
                style={{ fill: "var(--muted)", fontSize: 10 }}
              >
                % apurado →
              </text>

              {/* faixas */}
              {BANDAS.map((bd) => (
                <path key={`b-${bd.b}`} d={caminhoBanda(ord, bd.get, g.x, g.y)} style={{ fill: COR[bd.b], opacity: 0.13 }} />
              ))}
              {/* linhas */}
              {SERIES.map((s) => (
                <path
                  key={`${s.b}-${s.tipo}`}
                  d={caminhoLinha(ord, s.get, g.x, g.y)}
                  style={{
                    fill: "none",
                    stroke: COR[s.b],
                    strokeWidth: 2,
                    strokeLinejoin: "round",
                    strokeLinecap: "round",
                    strokeDasharray: s.tipo === "par" ? "5 4" : undefined,
                    opacity: s.tipo === "par" ? 0.8 : 1,
                  }}
                />
              ))}
              {/* rótulos diretos */}
              {g.rot.map((r) => (
                <text
                  key={`r-${r.b}`}
                  x={Math.min(r.xx, g.W - M.r) + 6}
                  y={r.yy}
                  dy="0.32em"
                  style={{ fill: COR[r.b], fontSize: 12, fontWeight: 600 }}
                >
                  {NOME_26[r.b]} {fmtPct(r.v, 1)}
                </text>
              ))}

              {/* cursor */}
              {pAtivo && (
                <g>
                  <line
                    x1={g.x(pAtivo.pa)}
                    x2={g.x(pAtivo.pa)}
                    y1={M.t}
                    y2={ALTURA - M.b}
                    style={{ stroke: "var(--muted)", strokeWidth: 1 }}
                  />
                  {SERIES.map((s) => {
                    const v = s.get(pAtivo);
                    return v == null ? null : (
                      <circle
                        key={`c-${s.b}-${s.tipo}`}
                        cx={g.x(pAtivo.pa)}
                        cy={g.y(v)}
                        r={4}
                        style={{
                          fill: s.tipo === "est" ? COR[s.b] : "var(--surface)",
                          stroke: s.tipo === "est" ? "var(--surface)" : COR[s.b],
                          strokeWidth: 2,
                        }}
                      />
                    );
                  })}
                </g>
              )}
              <rect
                x={M.l}
                y={M.t}
                width={Math.max(0, g.W - M.l - M.r)}
                height={ALTURA - M.t - M.b}
                style={{ fill: "transparent", touchAction: "pan-y" }}
                onPointerMove={mover}
                onPointerDown={mover}
                onPointerLeave={(e) => {
                  if (e.pointerType !== "touch") setAtivo(null);
                }}
              />
            </svg>
            {pAtivo && (
              <div
                role="presentation"
                className="pointer-events-none absolute top-1 z-10 w-max min-w-[11rem] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
                style={
                  g.x(pAtivo.pa) > g.W / 2
                    ? { right: g.W - g.x(pAtivo.pa) + 10 }
                    : { left: g.x(pAtivo.pa) + 10 }
                }
              >
                <p className="font-semibold text-strong">
                  {fmtPct(pAtivo.pa, 1)} apurado <span className="font-normal text-muted">· {fmtHora(pAtivo.t)}</span>
                </p>
                <table className="mt-1 w-full">
                  <thead>
                    <tr className="text-muted">
                      <th />
                      <th className="px-1 text-right font-normal">Estim.</th>
                      <th className="px-1 text-right font-normal">Parcial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["pt", "bolso"] as BlocoId[]).map((b) => (
                      <tr key={b}>
                        <th scope="row" className="pr-2 text-left font-medium" style={{ color: COR[b] }}>
                          {NOME_26[b]}
                        </th>
                        <td className="px-1 text-right font-semibold">{fmtPct(b === "pt" ? pAtivo.ePt : pAtivo.eBo, 1)}</td>
                        <td className="px-1 text-right">{fmtPct(b === "pt" ? pAtivo.pPt : pAtivo.pBo, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {demo
            ? "Série fictícia de demonstração."
            : `${ord.length} ${ord.length === 1 ? "ponto" : "pontos"} guardados neste navegador (${turno}º turno). Quem abre a página mais tarde vê a curva a partir daquele momento.`}
        </span>
        {onLimpar && ord.length > 0 && !demo && (
          <button
            type="button"
            onClick={onLimpar}
            className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:bg-surface-2"
          >
            Limpar histórico
          </button>
        )}
      </div>

      {ord.length >= 2 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Ver dados em tabela</summary>
          <div className="tabela-scroll mt-2 max-h-72 overflow-y-auto rounded-lg border border-line">
            <table className="w-full min-w-[28rem] text-xs">
              <caption className="sr-only">Pontos da evolução da estimativa, do mais recente para o mais antigo</caption>
              <thead className="sticky top-0 bg-surface text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-2 py-1 text-left font-medium">Horário</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">% apurado</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">Lula estim.</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">Lula parcial</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">Flávio estim.</th>
                  <th scope="col" className="px-2 py-1 text-right font-medium">Flávio parcial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ord
                  .slice()
                  .reverse()
                  .map((p) => (
                    <tr key={p.t} className={cx(pAtivo?.t === p.t && "bg-surface-2")}>
                      <td className="px-2 py-1">{fmtHora(p.t)}</td>
                      <td className="px-2 py-1 text-right">{fmtPct(p.pa, 1)}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmtPct(p.ePt, 1)}</td>
                      <td className="px-2 py-1 text-right">{fmtPct(p.pPt, 1)}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmtPct(p.eBo, 1)}</td>
                      <td className="px-2 py-1 text-right">{fmtPct(p.pBo, 1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
