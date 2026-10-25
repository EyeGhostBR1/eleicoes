// Legenda horizontal compacta para as escalas de colors.ts (sem hooks: server ou client).
import type { CSSProperties } from "react";
import {
  MAP_THEME_CLASS,
  legendGradient,
  marginLegend,
  swingLegend,
  type LegendData,
  type LegendKind,
  type LegendOptions,
} from "./colors";

export interface LegendProps extends LegendOptions {
  /** escala: "swing" (variação p.p.) ou "margin" (vantagem do líder). Ignorado se `data` vier. */
  kind?: LegendKind;
  /** dados prontos (swingLegend()/marginLegend()); tem precedência sobre `kind` */
  data?: LegendData;
  /** mostra o quadradinho "Sem dados" (padrão true) */
  showEmpty?: boolean;
  /** esconde o título (padrão false) */
  hideTitle?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function Legend({
  kind = "swing",
  data,
  showEmpty = true,
  hideTitle = false,
  className,
  style,
  ...opts
}: LegendProps) {
  const d = data ?? (kind === "margin" ? marginLegend(opts) : swingLegend(opts));
  const desc =
    d.kind === "margin"
      ? `Escala de vantagem: vermelho ${d.rightLabel.replace(" +", "")} à frente, azul ${d.leftLabel.replace(" +", "")} à frente; mais escuro = vantagem maior (até ${d.maxAbs} ${d.unit}).`
      : `Escala de variação: vermelho a favor de ${d.rightLabel.replace(" +", "")}, azul a favor de ${d.leftLabel.replace(" +", "")}; cinza = sem mudança (satura em ${d.maxAbs} ${d.unit}).`;

  return (
    <figure
      className={["m-0 flex w-full max-w-md flex-col gap-1 text-[11px] leading-tight text-muted", MAP_THEME_CLASS, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      aria-label={desc}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold" style={{ color: d.leftColor }}>
          {"← "}
          {d.leftLabel}
        </span>
        {!hideTitle && d.title && (
          <span className="truncate text-center">
            {d.title} ({d.unit})
          </span>
        )}
        <span className="font-semibold" style={{ color: d.rightColor }}>
          {d.rightLabel}
          {" →"}
        </span>
      </div>

      <div aria-hidden className="relative">
        <div
          className="h-2.5 w-full rounded-sm ring-1 ring-black/5 dark:ring-white/10"
          style={{ background: legendGradient(d) }}
        />
        <div className="relative mt-0.5 h-3.5">
          {d.ticks.map((t) => (
            <span
              key={t.value}
              className="absolute top-0 whitespace-nowrap tabular-nums"
              style={{
                left: `${t.pos * 100}%`,
                transform: t.pos <= 0.001 ? "none" : t.pos >= 0.999 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {showEmpty && (
        <div aria-hidden className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3.5 rounded-sm ring-1 ring-black/10 dark:ring-white/15"
            style={{ background: d.emptyColor }}
          />
          <span>{d.emptyLabel}</span>
        </div>
      )}
    </figure>
  );
}

export { Legend };
