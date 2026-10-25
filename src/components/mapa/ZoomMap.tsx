"use client";
// Mapa nacional de MUNICÍPIOS com zoom e arrasto (SVG, d3-geo + topojson-client).
//
// - Uma única projeção (Mercator ajustada ao contorno das UFs) para os ~5.570 municípios; as
//   geometrias de cada UF (/geo/mun/{uf}.json) chegam aos poucos e entram no mapa conforme
//   carregam (UF prioritária primeiro). Antes disso a UF aparece como silhueta cinza.
// - Zoom/arrasto aplicados direto no DOM (atributo transform de um <g>), sem re-render do React;
//   roda do mouse e duplo clique dão zoom no ponto do cursor; no celular, pinça e arrasto.
// - Teclado (com o mapa focado): setas movem, + / − dão zoom, 0 volta ao Brasil, Esc limpa a seleção.
// - Tooltip e contorno de "hover" vivem num store próprio: passar o mouse não re-renderiza os paths.
// - Fronteiras com vector-effect: non-scaling-stroke (espessura em px de tela, qualquer zoom).
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { geoMercator, geoPath, type GeoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { MAP_THEME_CLASS } from "@/components/map/colors";
import { cx } from "@/components/ui";

/** largura interna do viewBox */
const W = 1000;
const PAD = 6;
const K_MIN = 1;
const K_MAX = 80;
/** zoom máximo ao focar um município pequeno */
const K_FOCO_MUN = 28;
/** a partir deste zoom o mapa troca os estados pelos municípios */
const K_MUN = 2.2;

/** Ordem de carregamento padrão (maiores eleitorados primeiro). */
const ORDEM_UF = [
  "sp", "mg", "rj", "ba", "pr", "rs", "pe", "ce", "pa", "sc", "go", "ma", "am", "es",
  "pb", "rn", "mt", "al", "pi", "df", "ms", "se", "ro", "to", "ac", "ap", "rr",
];

export interface Shape {
  id: string;
  d: string;
  /** caixa no sistema do viewBox */
  b: [number, number, number, number];
}

interface Base {
  height: number;
  path: GeoPath;
  ufs: Shape[];
}

export interface ZoomMapControle {
  focarUf: (uf: string) => void;
  focarMun: (ibge: string) => void;
  reset: () => void;
}

export interface ZoomMapProps {
  /** cor por código IBGE do município */
  getFill: (ibge: string) => string;
  /** conteúdo do tooltip por código IBGE */
  getTooltip?: (ibge: string) => ReactNode;
  /**
   * Visão por estado: sem zoom, o mapa mostra as UFs com estas cores (sigla minúscula); os
   * municípios aparecem a partir do zoom K_MUN. Sem getFillUf, mostra sempre os municípios.
   */
  getFillUf?: (uf: string) => string;
  getTooltipUf?: (uf: string) => ReactNode;
  /** clique/toque num município (null = clique fora) */
  onSelect?: (ibge: string | null) => void;
  selectedId?: string | null;
  /** UF cujas geometrias carregam primeiro */
  prioridadeUf?: string | null;
  /** progresso do carregamento das geometrias (UFs prontas, total) */
  onProgresso?: (prontas: number, total: number) => void;
  ariaLabel: string;
  className?: string;
  ref?: Ref<ZoomMapControle>;
}

// ---------------------------------------------------------------------------
// Carga das geometrias (cache em nível de módulo: voltar à página é instantâneo)
// ---------------------------------------------------------------------------
let basePromise: Promise<Base> | null = null;
const munCache = new Map<string, Shape[]>();
const munPromises = new Map<string, Promise<Shape[]>>();

async function baixarTopo(src: string): Promise<Topology> {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${src}`);
  return (await r.json()) as Topology;
}

function caixa(path: GeoPath, f: Parameters<GeoPath>[0]): Shape["b"] {
  const [[x0, y0], [x1, y1]] = path.bounds(f);
  return [x0, y0, x1, y1];
}

function carregarBase(): Promise<Base> {
  if (!basePromise) {
    basePromise = baixarTopo("/geo/uf.json").then((topo) => {
      const obj = topo.objects.uf as GeometryCollection<Record<string, unknown>>;
      const fc = feature(topo, obj) as unknown as FeatureCollection<Geometry, Record<string, unknown>>;
      const proj = geoMercator();
      proj.fitWidth(W - 2 * PAD, fc);
      const [[, y0], [, y1]] = geoPath(proj).bounds(fc);
      const height = Math.ceil(y1 - y0 + 2 * PAD);
      proj.fitExtent(
        [
          [PAD, PAD],
          [W - PAD, height - PAD],
        ],
        fc,
      );
      // 2 casas: o mapa é ampliado até 80× e precisa de precisão sub-pixel
      const path = geoPath(proj).digits(2);
      const ufs: Shape[] = [];
      for (const f of fc.features) {
        const id = String(f.properties?.uf ?? "").toLowerCase();
        const d = f.geometry ? path(f) : null;
        if (id && d) ufs.push({ id, d, b: caixa(path, f) });
      }
      return { height, path, ufs };
    });
    basePromise.catch(() => {
      basePromise = null;
    });
  }
  return basePromise;
}

function carregarMun(uf: string, base: Base): Promise<Shape[]> {
  const pronto = munCache.get(uf);
  if (pronto) return Promise.resolve(pronto);
  let p = munPromises.get(uf);
  if (!p) {
    p = baixarTopo(`/geo/mun/${uf}.json`).then((topo) => {
      const obj = topo.objects.mun as GeometryCollection<Record<string, unknown>>;
      const fc = feature(topo, obj) as unknown as FeatureCollection<Geometry, Record<string, unknown>>;
      const out: Shape[] = [];
      for (const f of fc.features) {
        const id = f.properties?.ibge;
        const d = f.geometry ? base.path(f) : null;
        if (id != null && d) out.push({ id: String(id), d, b: caixa(base.path, f) });
      }
      munCache.set(uf, out);
      return out;
    });
    munPromises.set(uf, p);
    p.catch(() => munPromises.delete(uf));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Store do hover (tooltip + contorno) — fora do estado do React do mapa
// ---------------------------------------------------------------------------
interface Hover {
  id: string;
  /** posição do ponteiro relativa ao contêiner (px) */
  x: number;
  y: number;
}

function criarHoverStore() {
  let atual: Hover | null = null;
  const ls = new Set<() => void>();
  return {
    get: () => atual,
    set(v: Hover | null) {
      if (v === atual || (v && atual && v.id === atual.id && v.x === atual.x && v.y === atual.y)) return;
      atual = v;
      for (const l of ls) l();
    },
    subscribe(l: () => void) {
      ls.add(l);
      return () => {
        ls.delete(l);
      };
    },
  };
}
type HoverStore = ReturnType<typeof criarHoverStore>;

function useHover(store: HoverStore) {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

function ContornoHover({ store, porId, ufs }: { store: HoverStore; porId: Map<string, Shape>; ufs: Map<string, Shape> }) {
  const h = useHover(store);
  const s = h ? (porId.get(h.id) ?? ufs.get(h.id)) : null;
  if (!s) return null;
  return (
    <path
      d={s.d}
      fill="none"
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      style={{ stroke: "var(--map-hover, currentColor)", strokeWidth: 1.6, strokeLinejoin: "round" }}
    />
  );
}

function Tooltip({
  store,
  getTooltip,
  boxRef,
}: {
  store: HoverStore;
  getTooltip?: (id: string) => ReactNode;
  boxRef: React.RefObject<HTMLDivElement | null>;
}) {
  const h = useHover(store);
  const tipRef = useRef<HTMLDivElement>(null);
  const conteudo = h && getTooltip ? getTooltip(h.id) : null;
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const box = boxRef.current;
    if (!tip || !box || !h) return;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const off = 14;
    let left = h.x + off;
    if (left + tw > bw) left = h.x - off - tw;
    left = Math.min(Math.max(0, left), Math.max(0, bw - tw));
    let top = h.y + off;
    if (top + th > bh) top = h.y - off - th;
    top = Math.min(Math.max(0, top), Math.max(0, bh - th));
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  });
  if (!h || conteudo == null || conteudo === false) return null;
  return (
    <div
      ref={tipRef}
      role="tooltip"
      className="pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[min(18rem,100%)] rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs leading-snug text-fg shadow-lg"
      style={{ transform: "translate(-9999px, -9999px)" }}
    >
      {conteudo}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const MunPath = memo(function MunPath({ id, d, fill }: { id: string; d: string; fill: string }) {
  return <path data-id={id} d={d} vectorEffect="non-scaling-stroke" style={{ fill, transition: "fill 300ms ease" }} />;
});

const GrupoUf = memo(function GrupoUf({ shapes, getFill }: { shapes: Shape[]; getFill: (id: string) => string }) {
  return (
    <>
      {shapes.map((s) => (
        <MunPath key={s.id} id={s.id} d={s.d} fill={getFill(s.id)} />
      ))}
    </>
  );
});

function idDoAlvo(t: EventTarget | null): string | null {
  const el = t as Element | null;
  if (!el || typeof el.closest !== "function") return null;
  return el.closest("[data-id]")?.getAttribute("data-id") ?? null;
}

interface T {
  k: number;
  x: number;
  y: number;
}

const BotaoMapa = ({ onClick, rotulo, children }: { onClick: () => void; rotulo: string; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={rotulo}
    title={rotulo}
    className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-lg font-semibold text-fg shadow-sm hover:bg-surface-2"
  >
    {children}
  </button>
);

export default function ZoomMap({
  getFill,
  getTooltip,
  getFillUf,
  getTooltipUf,
  onSelect,
  selectedId,
  prioridadeUf,
  onProgresso,
  ariaLabel,
  className,
  ref,
}: ZoomMapProps) {
  const [base, setBase] = useState<Base | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [munPorUf, setMunPorUf] = useState<Record<string, Shape[]>>(() => Object.fromEntries(munCache));

  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const munGRef = useRef<SVGGElement>(null);
  // nível de detalhe: estados (sem zoom) ou municípios (com zoom)
  const [nivelZoom, setNivelZoom] = useState<"uf" | "mun">("uf");
  const nivelRef = useRef<"uf" | "mun">("uf");
  const ufGRef = useRef<SVGGElement>(null);
  const tRef = useRef<T>({ k: 1, x: 0, y: 0 });
  const animRef = useRef<number | null>(null);
  const [hover] = useState(criarHoverStore);
  const prioridadeRef = useRef(prioridadeUf);
  prioridadeRef.current = prioridadeUf;
  const onProgressoRef = useRef(onProgresso);
  onProgressoRef.current = onProgresso;

  const H = base?.height ?? Math.round(W * 0.98);

  // ---- carga ------------------------------------------------------------------------
  useEffect(() => {
    let vivo = true;
    carregarBase()
      .then((b) => {
        if (!vivo) return;
        setBase(b);
        setErro(null);
        const fila = ORDEM_UF.filter((u) => !munCache.has(u));
        const total = ORDEM_UF.length;
        onProgressoRef.current?.(total - fila.length, total);
        let prontas = total - fila.length;
        const proxima = () => {
          if (!fila.length) return null;
          const p = prioridadeRef.current;
          const i = p ? fila.indexOf(p) : -1;
          return fila.splice(i >= 0 ? i : 0, 1)[0];
        };
        const worker = async () => {
          for (let uf = proxima(); uf && vivo; uf = proxima()) {
            try {
              const shapes = await carregarMun(uf, b);
              if (!vivo) return;
              prontas++;
              setMunPorUf((m) => ({ ...m, [uf!]: shapes }));
              onProgressoRef.current?.(prontas, total);
            } catch (e) {
              if (vivo) setErro(e instanceof Error ? e.message : String(e));
            }
          }
        };
        for (let i = 0; i < 4; i++) void worker();
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const porId = useMemo(() => {
    const m = new Map<string, Shape>();
    for (const l of Object.values(munPorUf)) for (const s of l) m.set(s.id, s);
    return m;
  }, [munPorUf]);
  const ufPorId = useMemo(() => new Map((base?.ufs ?? []).map((u) => [`uf:${u.id}`, u])), [base]);
  const tooltip = useCallback(
    (id: string) => (id.startsWith("uf:") ? getTooltipUf?.(id.slice(3)) : getTooltip?.(id)),
    [getTooltip, getTooltipUf],
  );
  const porIdRef = useRef(porId);
  porIdRef.current = porId;

  // ---- transformação ----------------------------------------------------------------
  const aplicar = useCallback(() => {
    const { k, x, y } = tRef.current;
    gRef.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`);
    // nível de detalhe: fronteiras municipais finas no Brasil inteiro, mais visíveis com zoom
    if (munGRef.current) munGRef.current.style.strokeWidth = k < 1.8 ? "0.12" : k < 4 ? "0.3" : k < 10 ? "0.55" : "0.8";
    if (ufGRef.current) ufGRef.current.style.strokeWidth = k < 3 ? "0.9" : "1.6";
    const nivel = k >= K_MUN ? "mun" : "uf";
    if (nivel !== nivelRef.current) {
      nivelRef.current = nivel;
      setNivelZoom(nivel);
      hover.set(null); // o alvo do tooltip (estado ↔ município) deixou de existir
    }
  }, [hover]);

  const limitar = useCallback(
    (t: T): T => {
      const k = Math.min(K_MAX, Math.max(K_MIN, t.k));
      const fx = W * 0.3;
      const fy = H * 0.3;
      const x = Math.min(fx, Math.max(W - W * k - fx, t.x));
      const y = Math.min(fy, Math.max(H - H * k - fy, t.y));
      return { k, x, y };
    },
    [H],
  );

  const parar = () => {
    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  };

  const definir = useCallback(
    (t: T) => {
      tRef.current = limitar(t);
      aplicar();
    },
    [aplicar, limitar],
  );

  const animarPara = useCallback(
    (alvo: T, ms = 450) => {
      parar();
      const ini = { ...tRef.current };
      const fim = limitar(alvo);
      const t0 = performance.now();
      const passo = (agora: number) => {
        const u = Math.min(1, (agora - t0) / ms);
        const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
        // zoom interpolado em escala log; translação acompanha o centro
        const k = Math.exp(Math.log(ini.k) + (Math.log(fim.k) - Math.log(ini.k)) * e);
        const cx0 = (W / 2 - ini.x) / ini.k;
        const cy0 = (H / 2 - ini.y) / ini.k;
        const cx1 = (W / 2 - fim.x) / fim.k;
        const cy1 = (H / 2 - fim.y) / fim.k;
        const cxm = cx0 + (cx1 - cx0) * e;
        const cym = cy0 + (cy1 - cy0) * e;
        tRef.current = { k, x: W / 2 - k * cxm, y: H / 2 - k * cym };
        aplicar();
        animRef.current = u < 1 ? requestAnimationFrame(passo) : null;
      };
      animRef.current = requestAnimationFrame(passo);
    },
    [aplicar, limitar, H],
  );

  const focarCaixa = useCallback(
    (b: Shape["b"], kMax = K_MAX, kMin = K_MIN) => {
      const [x0, y0, x1, y1] = b;
      const k = Math.max(kMin, Math.min(kMax, 0.88 / Math.max((x1 - x0) / W, (y1 - y0) / H, 1e-6)));
      animarPara({ k, x: W / 2 - (k * (x0 + x1)) / 2, y: H / 2 - (k * (y0 + y1)) / 2 });
    },
    [animarPara, H],
  );

  const zoomEm = useCallback(
    (px: number, py: number, fator: number, animar = false) => {
      const t = tRef.current;
      const k = Math.min(K_MAX, Math.max(K_MIN, t.k * fator));
      const wx = (px - t.x) / t.k;
      const wy = (py - t.y) / t.k;
      const alvo = { k, x: px - k * wx, y: py - k * wy };
      if (animar) animarPara(alvo, 250);
      else {
        parar();
        definir(alvo);
      }
    },
    [animarPara, definir],
  );

  const reset = useCallback(() => animarPara({ k: 1, x: 0, y: 0 }), [animarPara]);

  // foca um estado já no nível dos municípios
  const focarUf = useCallback(
    (uf: string) => {
      const s = base?.ufs.find((u) => u.id === uf);
      if (s) focarCaixa(s.b, K_MAX, K_MUN + 0.3);
    },
    [base, focarCaixa],
  );

  useImperativeHandle(
    ref,
    () => ({
      focarUf,
      focarMun: (ibge: string) => {
        const s = porIdRef.current.get(ibge);
        if (s) focarCaixa(s.b, K_FOCO_MUN);
      },
      reset,
    }),
    [focarUf, focarCaixa, reset],
  );

  // reaplica a transformação depois de cada render (o React reescreve o atributo do <g>)
  useLayoutEffect(() => {
    aplicar();
  });

  // ---- coordenadas ------------------------------------------------------------------
  const paraViewBox = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const paraBox = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  // roda do mouse: listener nativo não passivo (para poder impedir a rolagem da página)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const escala = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0022;
      const [px, py] = paraViewBox(e.clientX, e.clientY);
      zoomEm(px, py, Math.exp(-e.deltaY * escala));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomEm, base]);

  // ---- ponteiros (arrasto, pinça, toque) ---------------------------------------------
  const ptrs = useRef(new Map<number, { x: number; y: number; cx: number; cy: number }>());
  const gesto = useRef<{
    t0: T;
    c0: [number, number];
    d0: number;
    moveu: boolean;
    inicio: { x: number; y: number };
    alvo: string | null;
    multi: boolean;
  } | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const iniciarGesto = (alvo: string | null, inicio: { x: number; y: number }, moveu: boolean, multi: boolean) => {
    const ps = [...ptrs.current.values()];
    const c0: [number, number] = [ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.y, 0) / ps.length];
    const d0 = ps.length >= 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    gesto.current = { t0: { ...tRef.current }, c0, d0, moveu, inicio, alvo, multi };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    parar();
    const [x, y] = paraViewBox(e.clientX, e.clientY);
    ptrs.current.set(e.pointerId, { x, y, cx: e.clientX, cy: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const g = gesto.current;
    iniciarGesto(
      ptrs.current.size === 1 ? idDoAlvo(e.target) : null,
      { x: e.clientX, y: e.clientY },
      g?.moveu ?? false,
      ptrs.current.size > 1 || !!g?.multi,
    );
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) {
      // sem botão pressionado: hover (mouse/caneta)
      if (e.pointerType === "touch") return;
      const id = idDoAlvo(e.target);
      hover.set(id ? { id, ...paraBox(e.clientX, e.clientY) } : null);
      return;
    }
    const [x, y] = paraViewBox(e.clientX, e.clientY);
    ptrs.current.set(e.pointerId, { x, y, cx: e.clientX, cy: e.clientY });
    const g = gesto.current;
    if (!g) return;
    if (!g.moveu && Math.hypot(e.clientX - g.inicio.x, e.clientY - g.inicio.y) > 5) {
      g.moveu = true;
      setArrastando(true);
      hover.set(null);
    }
    if (!g.moveu) return;
    const ps = [...ptrs.current.values()];
    const c: [number, number] = [ps.reduce((a, q) => a + q.x, 0) / ps.length, ps.reduce((a, q) => a + q.y, 0) / ps.length];
    let k = g.t0.k;
    if (ps.length >= 2 && g.d0 > 0) {
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      k = Math.min(K_MAX, Math.max(K_MIN, g.t0.k * (d / g.d0)));
    }
    // ponto do mapa sob o centro inicial do gesto acompanha o centro atual
    const wx = (g.c0[0] - g.t0.x) / g.t0.k;
    const wy = (g.c0[1] - g.t0.y) / g.t0.k;
    definir({ k, x: c[0] - k * wx, y: c[1] - k * wy });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesto.current;
    const tinha = ptrs.current.delete(e.pointerId);
    if (!tinha) return;
    if (ptrs.current.size > 0) {
      // um dedo saiu da pinça: recomeça o gesto com os que ficaram
      iniciarGesto(null, { x: e.clientX, y: e.clientY }, true, true);
      return;
    }
    gesto.current = null;
    setArrastando(false);
    if (!g || g.moveu || g.multi || e.type === "pointercancel") return;
    // toque/clique simples
    const id = g.alvo;
    if (id?.startsWith("uf:")) {
      // visão por estado: clicar num estado aproxima nele (e mostra os municípios)
      hover.set(null);
      focarUf(id.slice(3));
      return;
    }
    if (e.pointerType === "touch") hover.set(id ? { id, ...paraBox(e.clientX, e.clientY) } : null);
    onSelect?.(id);
  };

  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== "touch" && !ptrs.current.size) hover.set(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const [px, py] = paraViewBox(e.clientX, e.clientY);
    zoomEm(px, py, e.shiftKey ? 0.5 : 2, true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = tRef.current;
    const passo = W * 0.12;
    let feito = true;
    switch (e.key) {
      case "ArrowLeft":
        animarPara({ ...t, x: t.x + passo }, 150);
        break;
      case "ArrowRight":
        animarPara({ ...t, x: t.x - passo }, 150);
        break;
      case "ArrowUp":
        animarPara({ ...t, y: t.y + passo }, 150);
        break;
      case "ArrowDown":
        animarPara({ ...t, y: t.y - passo }, 150);
        break;
      case "+":
      case "=":
        zoomEm(W / 2, H / 2, 1.6, true);
        break;
      case "-":
      case "_":
        zoomEm(W / 2, H / 2, 1 / 1.6, true);
        break;
      case "0":
        reset();
        break;
      case "Escape":
        hover.set(null);
        onSelect?.(null);
        break;
      default:
        feito = false;
    }
    if (feito) e.preventDefault();
  };

  // ---- render -----------------------------------------------------------------------
  const nivel = getFillUf ? nivelZoom : "mun";
  const selecionado = nivel === "mun" && selectedId ? porId.get(selectedId) : null;
  const larguraMax = `min(100%, calc(80vh * ${(W / H).toFixed(4)}))`;

  return (
    <div
      className={cx(
        "relative w-full [--map-uf:rgba(15,23,42,.6)] dark:[--map-uf:rgba(226,232,240,.65)]",
        MAP_THEME_CLASS,
        className,
      )} style={{ maxWidth: larguraMax }}>
      <div
        ref={boxRef}
        tabIndex={0}
        role="application"
        aria-label={`${ariaLabel}. Setas movem o mapa, mais e menos dão zoom, zero volta ao Brasil.`}
        onKeyDown={onKeyDown}
        className="relative overflow-hidden rounded-lg bg-surface-2/40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus,#2563eb)]"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        {!base ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            {erro ? (
              <span className="flex flex-col items-center gap-2">
                Não foi possível carregar o mapa ({erro}).
                <button
                  type="button"
                  className="rounded-md border border-line bg-surface px-3 py-1 text-xs font-medium text-fg"
                  onClick={() => setTentativa((n) => n + 1)}
                >
                  Tentar novamente
                </button>
              </span>
            ) : (
              <span className="h-full w-full animate-pulse bg-surface-2" />
            )}
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-full w-full"
            style={{ touchAction: "none", cursor: arrastando ? "grabbing" : "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
            onDoubleClick={onDoubleClick}
            aria-hidden
          >
            <g ref={gRef}>
              {nivel === "uf" && getFillUf ? (
                /* visão por estado (sem zoom) */
                <g style={{ stroke: "var(--map-stroke, #fff)", strokeLinejoin: "round", cursor: "pointer" }}>
                  {base.ufs.map((u) => (
                    <path
                      key={u.id}
                      data-id={`uf:${u.id}`}
                      d={u.d}
                      vectorEffect="non-scaling-stroke"
                      style={{ fill: getFillUf(u.id), transition: "fill 300ms ease" }}
                    />
                  ))}
                </g>
              ) : (
                /* silhuetas das UFs ainda sem municípios */
                <g style={{ fill: "var(--map-empty, #e5e7eb)" }} pointerEvents="none">
                  {base.ufs.map((u) => (munPorUf[u.id] ? null : <path key={u.id} d={u.d} className="animate-pulse" />))}
                </g>
              )}
              <g
                ref={munGRef}
                style={{
                  stroke: "var(--map-stroke, #fff)",
                  strokeLinejoin: "round",
                  cursor: onSelect ? "pointer" : undefined,
                  display: nivel === "mun" ? undefined : "none",
                }}
              >
                {base.ufs.map((u) =>
                  munPorUf[u.id] ? <GrupoUf key={u.id} shapes={munPorUf[u.id]} getFill={getFill} /> : null,
                )}
              </g>
              <g ref={ufGRef} fill="none" pointerEvents="none" style={{ stroke: "var(--map-uf, rgba(15,23,42,.55))", strokeLinejoin: "round" }}>
                {base.ufs.map((u) => (
                  <path key={u.id} d={u.d} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
              <g pointerEvents="none">
                {selecionado && (
                  <path
                    d={selecionado.d}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    style={{ stroke: "var(--map-selected, currentColor)", strokeWidth: 2.4, strokeLinejoin: "round" }}
                  />
                )}
                <ContornoHover store={hover} porId={porId} ufs={ufPorId} />
              </g>
            </g>
          </svg>
        )}
        <Tooltip store={hover} getTooltip={tooltip} boxRef={boxRef} />
        {base && nivel === "uf" && getFillUf && (
          <p className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-md bg-surface/90 px-2 py-1 text-xs text-muted shadow-sm">
            Dê zoom ou clique num estado para ver os municípios
          </p>
        )}
        {base && (
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <BotaoMapa rotulo="Aproximar" onClick={() => zoomEm(W / 2, H / 2, 1.8, true)}>
              +
            </BotaoMapa>
            <BotaoMapa rotulo="Afastar" onClick={() => zoomEm(W / 2, H / 2, 1 / 1.8, true)}>
              −
            </BotaoMapa>
            <BotaoMapa rotulo="Ver o Brasil inteiro" onClick={reset}>
              <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
              </svg>
            </BotaoMapa>
          </div>
        )}
      </div>
    </div>
  );
}
