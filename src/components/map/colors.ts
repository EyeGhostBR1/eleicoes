// Escalas de cor dos mapas (funções puras; podem ser usadas em server e client components).
//
// Convenção de sinais (igual a compare.ts):
//   positivo  → lado PT (Lula / Haddad)        → vermelho  BLOCOS.pt.cor
//   negativo  → lado Bolsonaro (Flávio / Jair) → azul      BLOCOS.bolso.cor
//
// As cores são hex fixos (funcionam em SVG, canvas, exportação), interpoladas em OKLab
// para rampas perceptualmente uniformes. "Sem dados" usa a variável CSS --map-empty
// (definida pelo ChoroplethMap para claro/escuro), com fallback #e5e7eb.

import { BLOCOS } from "@/lib/config";

/** Cor de "sem dados" (null). Use em `style.fill`/`background` — não em atributo SVG. */
export const MAP_EMPTY = "var(--map-empty, #e5e7eb)";
/** Centro neutro das escalas divergentes (variação ~0 / empate) — cinza quente, distinto de "sem dados". */
export const MAP_NEUTRAL = "#ece8e1";

/**
 * Classes Tailwind que definem as variáveis do mapa por tema (claro/escuro):
 *  --map-empty  (sem dados), --map-stroke (fronteiras), --map-hover, --map-selected.
 * Aplicadas na raiz do ChoroplethMap e da Legend; para sobrescrever, defina as
 * variáveis num elemento DENTRO deles ou passe outras classes [--map-empty:...].
 */
export const MAP_THEME_CLASS =
  "[--map-empty:#d4d8df] dark:[--map-empty:#2b3344] [--map-stroke:var(--surface,#fff)] [--map-hover:var(--fg,#0f172a)] [--map-selected:var(--fg,#0f172a)]";

const PT = BLOCOS.pt.cor; // #d62828
const BO = BLOCOS.bolso.cor; // #1d4ed8
/** tons profundos para as maiores margens */
const PT_DEEP = "#7a0d12";
const BO_DEEP = "#0b2463";

// ---------------------------------------------------------------------------
// Interpolação em OKLab
// ---------------------------------------------------------------------------
type Lab = [number, number, number];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLab(hex: string): Lab {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  const r = toLin(((n >> 16) & 255) / 255);
  const g = toLin(((n >> 8) & 255) / 255);
  const b = toLin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((c) => {
        const v = Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255);
        return v.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

const labCache = new Map<string, Lab>();
function lab(hex: string): Lab {
  let v = labCache.get(hex);
  if (!v) labCache.set(hex, (v = hexToLab(hex)));
  return v;
}

/** Mistura duas cores hex em OKLab (t = 0 → a, t = 1 → b). */
export function mixColor(a: string, b: string, t: number): string {
  const x = lab(a);
  const y = lab(b);
  const k = Math.min(1, Math.max(0, t));
  return labToHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

/** Rampa por trechos: stops = [[t, cor], ...] com t crescente em [0, 1]. */
function ramp(stops: [number, string][], t: number): string {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    if (t <= t1) {
      const [t0, c0] = stops[i - 1];
      return mixColor(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}

const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------------
const SWING_PT: [number, string][] = [
  [0, MAP_NEUTRAL],
  [1, PT],
];
const SWING_BO: [number, string][] = [
  [0, MAP_NEUTRAL],
  [1, BO],
];
/** Margem: mesmo a menor vantagem já mostra a cor do líder (tom claro). */
const MARGIN_PT: [number, string][] = [
  [0, mixColor(MAP_NEUTRAL, PT, 0.22)],
  [0.55, PT],
  [1, PT_DEEP],
];
const MARGIN_BO: [number, string][] = [
  [0, mixColor(MAP_NEUTRAL, BO, 0.22)],
  [0.55, BO],
  [1, BO_DEEP],
];

/**
 * Escala divergente para variação em p.p. (ex.: Δ 2026 − 2022 da margem ou do % do PT).
 *  - positivo (PT ganhou)          → em direção a BLOCOS.pt.cor (vermelho)
 *  - negativo (lado Bolsonaro)     → em direção a BLOCOS.bolso.cor (azul)
 *  - ~0                            → cinza claro neutro
 *  - null                          → "var(--map-empty, #e5e7eb)"
 * |Δ| ≥ maxAbs satura na cor do bloco.
 */
export function swingColor(deltaPP: number | null, maxAbs = 15): string {
  if (!ok(deltaPP)) return MAP_EMPTY;
  const t = Math.min(1, Math.abs(deltaPP) / (maxAbs > 0 ? maxAbs : 15));
  if (t < 0.002) return MAP_NEUTRAL;
  return ramp(deltaPP > 0 ? SWING_PT : SWING_BO, t);
}

/**
 * Quem lidera e por quanto: margem = ptPct − boPct (p.p.).
 * Tons de vermelho se o PT lidera, de azul se Flávio/Jair lidera; mais escuro = maior vantagem
 * (satura em |margem| ≥ maxAbs). Empate exato → neutro. Algum lado null → "var(--map-empty, …)".
 */
export function marginColor(ptPct: number | null, boPct: number | null, maxAbs = 40): string {
  if (!ok(ptPct) || !ok(boPct)) return MAP_EMPTY;
  const m = ptPct - boPct;
  if (Math.abs(m) < 0.005) return MAP_NEUTRAL;
  const t = Math.min(1, Math.abs(m) / (maxAbs > 0 ? maxAbs : 40));
  return ramp(m > 0 ? MARGIN_PT : MARGIN_BO, t);
}

// ---------------------------------------------------------------------------
// Legendas
// ---------------------------------------------------------------------------
export type LegendKind = "swing" | "margin";

export interface LegendStop {
  /** 0–1 ao longo da barra (0 = esquerda, lado Bolsonaro) */
  offset: number;
  color: string;
}

export interface LegendTick {
  /** 0–1 ao longo da barra */
  pos: number;
  /** valor em p.p. (negativo = lado Bolsonaro) */
  value: number;
  /** rótulo pt-BR, em módulo: "0", "5", "≥15" */
  label: string;
}

export interface LegendData {
  kind: LegendKind;
  title?: string;
  maxAbs: number;
  /** gradiente da barra, da esquerda (Bolsonaro) para a direita (PT) */
  stops: LegendStop[];
  ticks: LegendTick[];
  /** "Flávio +" */
  leftLabel: string;
  /** "Lula +" */
  rightLabel: string;
  /** cor de TEXTO dos rótulos (CSS, ajustada ao tema via --c-bolso / --c-pt) */
  leftColor: string;
  rightColor: string;
  /** "p.p." */
  unit: string;
  emptyColor: string;
  /** "Sem dados" */
  emptyLabel: string;
}

export interface LegendOptions {
  maxAbs?: number;
  /** nome do lado PT (padrão "Lula") */
  ptLabel?: string;
  /** nome do lado Bolsonaro (padrão "Flávio") */
  boLabel?: string;
  title?: string;
  emptyLabel?: string;
  /** amostras do gradiente (padrão 25) */
  samples?: number;
}

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function niceStep(maxAbs: number): number {
  const raw = maxAbs / 3;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

function buildLegend(kind: LegendKind, color: (v: number) => string, opts: LegendOptions, defMax: number): LegendData {
  const maxAbs = opts.maxAbs && opts.maxAbs > 0 ? opts.maxAbs : defMax;
  const n = Math.max(5, opts.samples ?? 25);
  const stops: LegendStop[] = [];
  for (let i = 0; i < n; i++) {
    const offset = i / (n - 1);
    const v = (offset * 2 - 1) * maxAbs;
    // na margem há um salto em 0 (neutro → tom claro do líder): força bordas nítidas
    if (kind === "margin" && Math.abs(v) < 1e-9) {
      stops.push({ offset: 0.5, color: color(-1e-6 * maxAbs - 0.01) });
      stops.push({ offset: 0.5, color: color(1e-6 * maxAbs + 0.01) });
      continue;
    }
    stops.push({ offset, color: color(v) });
  }
  const step = niceStep(maxAbs);
  const ticks: LegendTick[] = [];
  for (let v = -Math.floor(maxAbs / step) * step; v <= maxAbs + 1e-9; v += step) {
    const value = Math.round(v * 1000) / 1000;
    ticks.push({ pos: (value + maxAbs) / (2 * maxAbs), value, label: nf.format(Math.abs(value)) });
  }
  // extremos marcam saturação: "≥15"
  for (const t of ticks) if (Math.abs(Math.abs(t.value) - maxAbs) < 1e-9) t.label = `≥${nf.format(maxAbs)}`;
  const pt = opts.ptLabel ?? BLOCOS.pt.nomes["2026"];
  const bo = opts.boLabel ?? "Flávio";
  return {
    kind,
    title: opts.title,
    maxAbs,
    stops,
    ticks,
    leftLabel: `${bo} +`,
    rightLabel: `${pt} +`,
    leftColor: `var(--c-bolso, ${BO})`,
    rightColor: `var(--c-pt, ${PT})`,
    unit: "p.p.",
    emptyColor: MAP_EMPTY,
    emptyLabel: opts.emptyLabel ?? "Sem dados",
  };
}

/** Legenda da escala swingColor (variação em p.p.). */
export function swingLegend(opts: LegendOptions = {}): LegendData {
  const maxAbs = opts.maxAbs && opts.maxAbs > 0 ? opts.maxAbs : 15;
  return buildLegend("swing", (v) => swingColor(v, maxAbs), { ...opts, title: opts.title ?? "Variação" }, 15);
}

/** Legenda da escala marginColor (vantagem em p.p. de quem lidera). */
export function marginLegend(opts: LegendOptions = {}): LegendData {
  const maxAbs = opts.maxAbs && opts.maxAbs > 0 ? opts.maxAbs : 40;
  return buildLegend("margin", (v) => marginColor(v > 0 ? v : 0, v > 0 ? 0 : -v, maxAbs), { ...opts, title: opts.title ?? "Vantagem" }, 40);
}

/** CSS `linear-gradient(...)` para desenhar a barra da legenda. */
export function legendGradient(d: LegendData, direction = "to right"): string {
  return `linear-gradient(${direction}, ${d.stops.map((s) => `${s.color} ${(s.offset * 100).toFixed(2)}%`).join(", ")})`;
}
