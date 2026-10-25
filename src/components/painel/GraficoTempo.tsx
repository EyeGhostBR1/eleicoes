"use client";
// Gráfico de linhas no tempo de apuração (eixo x = minutos após o fechamento das urnas), em SVG.
//
// - Largura medida no contêiner (ResizeObserver): textos e linhas em pixels reais.
// - Linhas de 2px; série de referência tracejada (1º turno) e série em foco contínua (2º turno);
//   ponto final com anel na cor da superfície. Grade e eixos em linhas finas sólidas.
// - Linha-guia + tooltip com todas as séries no minuto apontado (mouse, toque ou setas do teclado),
//   com a hora do relógio de cada turno. Tabela com os mesmos dados (a cada 15 min) em <details>.
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { cx } from "../ui";
import { fmtDuracao, relogio } from "./tempo";

export interface SerieTempo {
  id: string;
  rotulo: string;
  /** rótulo curto (tooltip e tabela); padrão = rotulo */
  curto?: string;
  /** cor CSS da linha (ex.: "var(--viz-foco)") */
  cor: string;
  tracejado?: boolean;
  /** um ponto a cada `passoMin` minutos desde o fechamento; null = sem dado */
  pontos: (number | null)[];
  /** fechamento das urnas (ISO) do turno da série — hora no tooltip/tabela */
  fechamento?: string;
}

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.round(e[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function caminho(pontos: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let aberto = false;
  pontos.forEach((v, i) => {
    if (v == null || !isFinite(v)) {
      aberto = false;
      return;
    }
    d += `${aberto ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    aberto = true;
  });
  return d;
}

function ChaveLinha({ cor, tracejado }: { cor: string; tracejado?: boolean }) {
  return (
    <svg aria-hidden width="18" height="8" className="shrink-0">
      <line x1="1" x2="17" y1="4" y2="4" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeDasharray={tracejado ? "4 3" : undefined} />
    </svg>
  );
}

export function LegendaTempo({ series }: { series: Pick<SerieTempo, "id" | "rotulo" | "cor" | "tracejado">[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg">
      {series.map((s) => (
        <li key={s.id} className="inline-flex items-center gap-1.5">
          <ChaveLinha cor={s.cor} tracejado={s.tracejado} />
          {s.rotulo}
        </li>
      ))}
    </ul>
  );
}

export default function GraficoTempo({
  series,
  passoMin,
  yMin,
  yMax,
  ticksY,
  fmtY,
  fmtValor = fmtY,
  altura = 240,
  ariaLabel,
  polaridade,
  compacto = false,
  agoraMin,
  tabela = !compacto,
  legenda = !compacto,
}: {
  series: SerieTempo[];
  passoMin: number;
  yMin: number;
  yMax: number;
  ticksY: number[];
  /** rótulo do eixo y */
  fmtY: (v: number) => string;
  /** valor no tooltip e na tabela (padrão = fmtY) */
  fmtValor?: (v: number) => string;
  altura?: number;
  ariaLabel: string;
  /** destaca y = 0 e escreve o que significa acima/abaixo dele */
  polaridade?: { acima: string; abaixo: string };
  /** versão miniatura (pequenos múltiplos) */
  compacto?: boolean;
  /** marca "agora" (minutos após o fechamento) */
  agoraMin?: number | null;
  tabela?: boolean;
  legenda?: boolean;
}) {
  const [boxRef, W] = useLargura<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  const H = altura;
  const M = compacto ? { l: 36, r: 8, t: 6, b: 18 } : { l: 44, r: 16, t: 12, b: 26 };
  const n = Math.max(1, ...series.map((s) => s.pontos.length));
  const maxIdx = n - 1;
  const xMax = Math.max(60, maxIdx * passoMin, agoraMin != null && isFinite(agoraMin) ? agoraMin : 0);
  const pw = Math.max(10, W - M.l - M.r);
  const ph = Math.max(10, H - M.t - M.b);
  const xMin = (min: number) => M.l + (min / xMax) * pw;
  const xi = (i: number) => xMin(i * passoMin);
  const y = (v: number) => M.t + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin || 1)) * ph;

  const passoTick = xMax <= 240 ? 60 : xMax <= 480 ? 120 : 180;
  const ticksX: number[] = [];
  for (let t = 0; t <= xMax + 1e-9; t += passoTick) ticksX.push(t);

  // posiciona o tooltip depois de cada render (DOM direto, sem re-render)
  useEffect(() => {
    const tip = tipRef.current;
    if (!tip || idx == null) return;
    const xp = xi(idx);
    const tw = tip.offsetWidth;
    let left = xp + 12;
    if (left + tw > W) left = xp - 12 - tw;
    tip.style.transform = `translate(${Math.max(0, Math.round(left))}px, ${M.t}px)`;
  });

  const apontar = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const min = ((e.clientX - r.left - M.l) / pw) * xMax;
    setIdx(Math.min(maxIdx, Math.max(0, Math.round(min / passoMin))));
  };
  const teclado = (e: KeyboardEvent<SVGSVGElement>) => {
    const atual = idx ?? maxIdx;
    let novo: number | null = atual;
    if (e.key === "ArrowLeft") novo = Math.max(0, atual - 1);
    else if (e.key === "ArrowRight") novo = Math.min(maxIdx, atual + 1);
    else if (e.key === "Home") novo = 0;
    else if (e.key === "End") novo = maxIdx;
    else if (e.key === "Escape") novo = null;
    else return;
    e.preventDefault();
    setIdx(novo);
  };

  const minIdx = idx == null ? null : idx * passoMin;
  const fs = compacto ? 10 : 11;

  return (
    <div className="space-y-2">
      {legenda && <LegendaTempo series={series} />}
      <div ref={boxRef} className="relative w-full" style={{ height: H }}>
        {W > 0 && (
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={ariaLabel}
            aria-describedby={idx != null ? tipId : undefined}
            tabIndex={0}
            className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            onPointerMove={apontar}
            onPointerDown={apontar}
            onPointerLeave={(e) => e.pointerType !== "touch" && setIdx(null)}
            onKeyDown={teclado}
            onFocus={() => setIdx((i) => i ?? maxIdx)}
            onBlur={() => setIdx(null)}
          >
            {/* grade e eixos */}
            <g>
              {ticksY.map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                  <text x={M.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={fs} fill="var(--muted)" className="tabular-nums">
                    {fmtY(t)}
                  </text>
                </g>
              ))}
              {polaridade && (
                <>
                  <line x1={M.l} x2={M.l + pw} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
                  {!compacto && (
                    <>
                      <text x={M.l + 6} y={M.t + 4} dy="0.7em" fontSize={fs} fill="var(--muted)">
                        ↑ {polaridade.acima}
                      </text>
                      <text x={M.l + 6} y={M.t + ph - 4} fontSize={fs} fill="var(--muted)">
                        ↓ {polaridade.abaixo}
                      </text>
                    </>
                  )}
                </>
              )}
              {ticksX.map((t) => (
                <text key={`x${t}`} x={xMin(t)} y={H - 6} textAnchor="middle" fontSize={fs} fill="var(--muted)" className="tabular-nums">
                  {`${Math.round(t / 60)}h`}
                </text>
              ))}
              <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke="var(--line)" strokeWidth={1} />
            </g>

            {agoraMin != null && isFinite(agoraMin) && agoraMin >= 0 && agoraMin <= xMax && (
              <g>
                <line x1={xMin(agoraMin)} x2={xMin(agoraMin)} y1={M.t} y2={M.t + ph} stroke="var(--muted)" strokeWidth={1} />
                {!compacto && (
                  <text x={xMin(agoraMin) - 4} y={M.t} dy="0.7em" textAnchor="end" fontSize={fs} fill="var(--muted)">
                    agora
                  </text>
                )}
              </g>
            )}

            {/* séries */}
            {series.map((s) => (
              <path
                key={s.id}
                d={caminho(s.pontos, xi, y)}
                fill="none"
                stroke={s.cor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.tracejado ? "5 4" : undefined}
              />
            ))}
            {series.map((s) => {
              let i = s.pontos.length - 1;
              while (i >= 0 && (s.pontos[i] == null || !isFinite(s.pontos[i]!))) i--;
              if (i < 0) return null;
              return <circle key={`fim-${s.id}`} cx={xi(i)} cy={y(s.pontos[i]!)} r={compacto ? 3 : 4} fill={s.cor} stroke="var(--surface)" strokeWidth={2} />;
            })}

            {/* linha-guia */}
            {idx != null && (
              <g pointerEvents="none">
                <line x1={xi(idx)} x2={xi(idx)} y1={M.t} y2={M.t + ph} stroke="var(--muted)" strokeWidth={1} />
                {series.map((s) => {
                  const v = s.pontos[idx];
                  return v == null || !isFinite(v) ? null : (
                    <circle key={`g-${s.id}`} cx={xi(idx)} cy={y(v)} r={4} fill={s.cor} stroke="var(--surface)" strokeWidth={2} />
                  );
                })}
              </g>
            )}
          </svg>
        )}
        {idx != null && minIdx != null && (
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="pointer-events-none absolute left-0 top-0 z-10 w-max max-w-[16rem] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ transform: "translate(-9999px, -9999px)" }}
          >
            <p className="mb-1 text-muted">{fmtDuracao(minIdx)} após o fechamento</p>
            <ul className="space-y-0.5">
              {series.map((s) => {
                const v = s.pontos[idx];
                return (
                  <li key={s.id} className="flex items-center gap-1.5">
                    <ChaveLinha cor={s.cor} tracejado={s.tracejado} />
                    <span className="font-semibold tabular-nums text-fg">{v == null || !isFinite(v) ? "—" : fmtValor(v)}</span>
                    <span className="text-muted">
                      {s.curto ?? s.rotulo}
                      {s.fechamento && ` · ${relogio(s.fechamento, minIdx)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {tabela && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-fg">Ver os dados em tabela</summary>
          <div className="tabela-scroll mt-2 max-h-64 overflow-y-auto rounded-md border border-line">
            <table className="w-full text-xs">
              <caption className="sr-only">{ariaLabel}: valores a cada 15 minutos após o fechamento</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="px-2 py-1 text-left font-medium">
                    Após o fechamento
                  </th>
                  {series.map((s) => (
                    <th key={s.id} scope="col" className="px-2 py-1 text-right font-medium">
                      {s.curto ?? s.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Array.from({ length: Math.floor(maxIdx / 3) + 1 }, (_, k) => k * 3).map((i) => (
                  <tr key={i}>
                    <th scope="row" className="px-2 py-1 text-left font-normal tabular-nums">
                      {fmtDuracao(i * passoMin)}
                    </th>
                    {series.map((s) => {
                      const v = s.pontos[i];
                      return (
                        <td key={s.id} className={cx("px-2 py-1 text-right tabular-nums", v == null && "text-muted")}>
                          {v == null || !isFinite(v) ? "—" : fmtValor(v)}
                          {s.fechamento && v != null && <span className="ml-1 text-muted">({relogio(s.fechamento, i * passoMin)})</span>}
                        </td>
                      );
                    })}
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
