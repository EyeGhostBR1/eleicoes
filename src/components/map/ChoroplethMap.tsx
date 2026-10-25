"use client";
// Mapa coroplético em SVG (d3-geo + topojson-client).
//
// - O TopoJSON é baixado no cliente (cache por `src` em nível de módulo) e projetado uma única
//   vez (geoMercator ajustado a uma largura interna fixa, viewBox responsivo).
// - Os <path> são memoizados: numa atualização de dados só o `fill` muda no DOM.
// - Tooltip segue o ponteiro (posicionado direto no DOM, sem re-render), limitado ao contêiner.
// - Acessível: com `onSelect`, cada área é focável (Tab) e Enter/Espaço seleciona.
//
// Cores: `getFill` deve devolver uma cor CSS (hex, var(--x), color-mix...). O fill é aplicado
// via `style`, então `var(--map-empty, #e5e7eb)` funciona.

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { MAP_THEME_CLASS } from "./colors";

export interface ChoroplethMapProps {
  /** URL do TopoJSON, ex. "/geo/uf.json" ou "/geo/mun/sp.json" */
  src: string;
  objectName: "uf" | "mun";
  /** propriedade usada como id da feição */
  idProp: "uf" | "ibge";
  /** cor de preenchimento por feição (qualquer cor CSS) */
  getFill: (id: string) => string;
  /** conteúdo do tooltip ao passar o mouse / focar / tocar; null/undefined = sem tooltip */
  getTooltip?: (id: string) => ReactNode;
  /** clique / Enter / Espaço */
  onSelect?: (id: string) => void;
  /** feição destacada */
  selectedId?: string | null;
  ariaLabel: string;
  className?: string;
  /** altura/largura; padrão = proporção do contorno da área */
  aspect?: number;
  /** (opcional) rótulo acessível de cada área (aria-label); padrão = id */
  getLabel?: (id: string) => string;
  /** (opcional) espessura das fronteiras em px de tela; padrão 0.8 (uf) / 0.4 (mun) */
  strokeWidth?: number;
}

/** largura interna do viewBox */
const W = 800;
const PAD = 4;

interface Shape {
  id: string;
  d: string;
  /** centróide projetado (unidades do viewBox) — âncora do tooltip no foco por teclado */
  cx: number;
  cy: number;
}

interface MapGeo {
  width: number;
  height: number;
  shapes: Shape[];
  byId: Map<string, Shape>;
}

type Entry =
  | { status: "loading" }
  | { status: "ready"; geo: MapGeo }
  | { status: "error"; error: string };

// ---------------------------------------------------------------------------
// Cache/store em nível de módulo
// ---------------------------------------------------------------------------
const LOADING: Entry = { status: "loading" };
const topoCache = new Map<string, Promise<Topology>>();
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function loadTopo(src: string): Promise<Topology> {
  let p = topoCache.get(src);
  if (!p) {
    p = fetch(src).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()) as Topology;
    });
    topoCache.set(src, p);
    p.catch(() => topoCache.delete(src));
  }
  return p;
}

/** Pré-carrega um TopoJSON (ex.: ao passar o mouse num link para o mapa do estado). */
export function prefetchMap(src: string): void {
  loadTopo(src).catch(() => {});
}

function buildGeo(topo: Topology, objectName: string, idProp: string, aspect?: number): MapGeo {
  const obj = topo.objects?.[objectName] as GeometryCollection<Record<string, unknown>> | undefined;
  if (!obj) throw new Error(`objeto "${objectName}" ausente no TopoJSON`);
  const fc = feature(topo, obj) as unknown as FeatureCollection<Geometry, Record<string, unknown>>;
  fc.features = fc.features.filter((f) => f.geometry);

  const proj = geoMercator();
  let height: number;
  if (aspect && aspect > 0 && isFinite(aspect)) {
    height = Math.round(W * aspect);
  } else {
    proj.fitWidth(W - 2 * PAD, fc);
    const [[, y0], [, y1]] = geoPath(proj).bounds(fc);
    height = Math.max(40, Math.ceil(y1 - y0 + 2 * PAD));
  }
  proj.fitExtent(
    [
      [PAD, PAD],
      [W - PAD, height - PAD],
    ],
    fc,
  );
  const path = geoPath(proj).digits(1);

  const shapes: Shape[] = [];
  const byId = new Map<string, Shape>();
  for (const f of fc.features) {
    const raw = f.properties?.[idProp];
    if (raw == null) continue;
    const id = String(raw);
    const d = path(f);
    if (!d) continue;
    const [cx, cy] = path.centroid(f);
    const s: Shape = { id, d, cx: isFinite(cx) ? cx : W / 2, cy: isFinite(cy) ? cy : height / 2 };
    shapes.push(s);
    byId.set(id, s);
  }
  return { width: W, height, shapes, byId };
}

function ensureEntry(key: string, src: string, objectName: string, idProp: string, aspect?: number) {
  if (entries.has(key)) return;
  entries.set(key, LOADING);
  loadTopo(src)
    .then((topo) => {
      entries.set(key, { status: "ready", geo: buildGeo(topo, objectName, idProp, aspect) });
    })
    .catch((e: unknown) => {
      entries.set(key, { status: "error", error: e instanceof Error ? e.message : String(e) });
    })
    .finally(emit);
}

function useMapGeo(src: string, objectName: string, idProp: string, aspect?: number) {
  const key = `${src}|${objectName}|${idProp}|${aspect ?? ""}`;
  const entry = useSyncExternalStore(
    subscribe,
    () => entries.get(key) ?? LOADING,
    () => LOADING,
  );
  useEffect(() => {
    ensureEntry(key, src, objectName, idProp, aspect);
  }, [key, src, objectName, idProp, aspect]);
  const retry = useCallback(() => {
    entries.delete(key);
    topoCache.delete(src);
    ensureEntry(key, src, objectName, idProp, aspect);
    emit();
  }, [key, src, objectName, idProp, aspect]);
  return [entry, retry] as const;
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------
const ShapePath = memo(function ShapePath({
  id,
  d,
  fill,
  interactive,
  label,
  describedBy,
}: {
  id: string;
  d: string;
  fill: string;
  interactive: boolean;
  label?: string;
  describedBy?: string;
}) {
  return (
    <path
      data-id={id}
      d={d}
      vectorEffect="non-scaling-stroke"
      style={{ fill, outline: "none", transition: "fill 300ms ease" }}
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? "button" : undefined}
      aria-label={interactive ? label : undefined}
      aria-describedby={describedBy}
    />
  );
});

type Via = "pointer" | "touch" | "focus";
interface Active {
  id: string;
  via: Via;
}

function idFromTarget(t: EventTarget | null): string | null {
  const el = t as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  return el.closest("[data-id]")?.getAttribute("data-id") ?? null;
}

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export default function ChoroplethMap({
  src,
  objectName,
  idProp,
  getFill,
  getTooltip,
  onSelect,
  selectedId,
  ariaLabel,
  className,
  aspect,
  getLabel,
  strokeWidth,
}: ChoroplethMapProps) {
  const [entry, retry] = useMapGeo(src, objectName, idProp, aspect);
  const geo = entry.status === "ready" ? entry.geo : null;

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [active, setActive] = useState<Active | null>(null);
  const tipId = useId();

  const interactive = !!onSelect;
  const sw = strokeWidth ?? (objectName === "uf" ? 0.8 : 0.4);
  const activeShape = active && geo ? (geo.byId.get(active.id) ?? null) : null;
  const selectedShape = selectedId && geo ? (geo.byId.get(selectedId) ?? null) : null;
  const tipContent = activeShape && getTooltip ? getTooltip(activeShape.id) : null;
  const showTip = tipContent != null && tipContent !== false;

  // posiciona o tooltip (DOM direto) ------------------------------------------------
  const placeTip = () => {
    const tip = tipRef.current;
    const box = boxRef.current;
    const svg = svgRef.current;
    if (!tip || !box) return;
    let x = pointer.current.x;
    let y = pointer.current.y;
    if (active?.via === "focus" && activeShape && svg && geo) {
      const k = svg.clientWidth / geo.width;
      x = activeShape.cx * k;
      y = activeShape.cy * k;
    }
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const off = 14;
    let left = x + off;
    if (left + tw > bw) left = x - off - tw;
    left = Math.min(Math.max(0, left), Math.max(0, bw - tw));
    let top = y + off;
    if (top + th > bh) top = y - off - th;
    top = Math.min(Math.max(0, top), Math.max(0, bh - th));
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };

  // após cada render (novo alvo ou novo conteúdo), reposiciona antes da pintura
  useLayoutEffect(() => {
    if (showTip) placeTip();
  });

  // toque: fecha o tooltip ao tocar fora do mapa
  useEffect(() => {
    if (active?.via !== "touch") return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active?.via]);

  // eventos delegados ----------------------------------------------------------------
  const setPointer = (e: ReactPointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    setPointer(e);
    if (e.pointerType === "touch") return;
    const id = idFromTarget(e.target);
    setActive((prev) => {
      if (!id) return prev && prev.via === "pointer" ? null : prev;
      if (prev && prev.id === id && prev.via === "pointer") return prev;
      return { id, via: "pointer" };
    });
    if (id && active?.id === id) placeTip();
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    setPointer(e);
    const id = idFromTarget(e.target);
    // toque: o tooltip fica aberto até outro toque; mouse/caneta: garante o alvo sob o ponteiro
    const via: Via = e.pointerType === "touch" ? "touch" : "pointer";
    setActive(id ? { id, via } : null);
  };

  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") return;
    setActive((prev) => (prev && prev.via === "pointer" ? null : prev));
  };

  const onClick = (e: ReactMouseEvent<SVGGElement>) => {
    const id = idFromTarget(e.target);
    if (id && onSelect) onSelect(id);
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>) => {
    if (!onSelect) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      const id = idFromTarget(e.target);
      if (id) {
        e.preventDefault();
        onSelect(id);
      }
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const onFocus = (e: ReactFocusEvent<SVGGElement>) => {
    const id = idFromTarget(e.target);
    if (!id) return;
    let kb = true;
    try {
      kb = (e.target as Element).matches(":focus-visible");
    } catch {}
    if (kb) setActive({ id, via: "focus" });
  };

  const onBlur = () => {
    setActive((prev) => (prev && prev.via === "focus" ? null : prev));
  };

  // estados de carregamento / erro ---------------------------------------------------
  const fallbackAspect = aspect ?? (objectName === "uf" ? 1.05 : 0.85);

  if (entry.status !== "ready" || !geo) {
    return (
      <div
        className={cx("relative w-full", MAP_THEME_CLASS, className)}
        style={{ aspectRatio: `1 / ${fallbackAspect}` }}
        role="img"
        aria-label={ariaLabel}
        aria-busy={entry.status === "loading"}
      >
        {entry.status === "error" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">
            <span>Não foi possível carregar o mapa.</span>
            <span className="text-xs opacity-80">{entry.error}</span>
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-line bg-surface px-3 py-1 text-xs font-medium text-fg hover:bg-surface-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="h-full w-full animate-pulse rounded-lg bg-surface-2" />
        )}
      </div>
    );
  }

  const overlay = (s: Shape, stroke: string, width: number, key: string) => (
    <path
      key={key}
      d={s.d}
      fill="none"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      style={{ stroke, strokeWidth: width, strokeLinejoin: "round" }}
    />
  );

  return (
    <div ref={boxRef} className={cx("relative w-full select-none", MAP_THEME_CLASS, className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        className="block h-auto w-full"
        style={{ touchAction: "manipulation" }}
        role={interactive ? "group" : "img"}
        aria-label={ariaLabel}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
      >
        <g
          style={{
            stroke: "var(--map-stroke, #fff)",
            strokeWidth: sw,
            strokeLinejoin: "round",
            cursor: interactive ? "pointer" : undefined,
          }}
          onClick={interactive ? onClick : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
          onFocus={interactive ? onFocus : undefined}
          onBlur={interactive ? onBlur : undefined}
        >
          {geo.shapes.map((s) => (
            <ShapePath
              key={s.id}
              id={s.id}
              d={s.d}
              fill={getFill(s.id)}
              interactive={interactive}
              label={interactive ? (getLabel ? getLabel(s.id) : s.id) : undefined}
              describedBy={showTip && active?.via === "focus" && active.id === s.id ? tipId : undefined}
            />
          ))}
        </g>
        <g aria-hidden>
          {selectedShape && overlay(selectedShape, "var(--map-selected, currentColor)", 2.2, "sel")}
          {activeShape &&
            (active?.via === "focus"
              ? overlay(activeShape, "var(--focus, #2563eb)", 2.6, "act")
              : activeShape !== selectedShape && overlay(activeShape, "var(--map-hover, currentColor)", 1.4, "act"))}
        </g>
      </svg>

      {showTip && (
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className="pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[min(18rem,100%)] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs leading-snug text-fg shadow-lg"
          style={{ transform: "translate(-9999px, -9999px)" }}
        >
          {tipContent}
        </div>
      )}
    </div>
  );
}

export { ChoroplethMap };
