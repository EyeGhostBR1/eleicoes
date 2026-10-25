// Métricas dos mapas coropléticos (UF e município) e respectivas cores.
//
// Convenção de cor única em TODAS as métricas (mantém a legenda consistente):
//   vermelho = lado Lula/PT, azul = lado Flávio/Bolsonaro.
//   - Margem: vermelho = Lula à frente; azul = Flávio/Jair à frente.
//   - Variação de Lula: vermelho = Lula subiu; azul = Lula caiu.
//   - Variação de Flávio vs Jair: azul = Flávio acima de Jair; vermelho = abaixo.
//     (por isso o sinal é invertido antes de chamar swingColor)
import { type LegendData, marginColor, marginLegend, swingColor, swingLegend } from "@/components/map/colors";
import { deltaPP, margem, type LinhaComparacao } from "@/lib/compare";
import type { BlocoId } from "@/lib/types";

export type MetricaId =
  | "margem26"
  | "ptT"
  | "boT"
  | "margemT"
  | "pt22"
  | "bo22"
  | "pt18"
  | "bo18"
  | "margem22"
  | "margem18";

export interface ValoresLugar {
  pt26: number | null;
  bo26: number | null;
  pt22: number | null;
  bo22: number | null;
  pt18: number | null;
  bo18: number | null;
  /** 1º turno de 2026 (% dos válidos) — só na comparação entre turnos (página no 2º turno) */
  pt1?: number | null;
  bo1?: number | null;
}

export interface Metrica {
  id: MetricaId;
  rotulo: string;
  tipo: "margem" | "swing";
  /** precisa de dados de 2026 */
  live: boolean;
  /** compara 1º × 2º turno de 2026 (só no 2º turno) */
  turnos?: boolean;
  /** bloco cuja variação é medida (métricas de swing) */
  bloco?: BlocoId;
  explicacao: string;
}

export const METRICAS: Metrica[] = [
  {
    id: "margem26",
    rotulo: "Margem 2026",
    tipo: "margem",
    live: true,
    explicacao: "Diferença Lula − Flávio em 2026 (p.p. dos válidos). Vermelho: Lula à frente; azul: Flávio à frente.",
  },
  {
    id: "ptT",
    rotulo: "Lula: 2º − 1º turno",
    tipo: "swing",
    live: true,
    turnos: true,
    bloco: "pt",
    explicacao: "Lula no 2º turno − Lula no 1º turno de 2026 (p.p. dos válidos). Vermelho forte: Lula cresceu muito; azul: Lula caiu.",
  },
  {
    id: "boT",
    rotulo: "Flávio: 2º − 1º turno",
    tipo: "swing",
    live: true,
    turnos: true,
    bloco: "bolso",
    explicacao: "Flávio no 2º turno − Flávio no 1º turno de 2026 (p.p. dos válidos). Azul forte: Flávio cresceu muito; vermelho: Flávio caiu.",
  },
  {
    id: "margemT",
    rotulo: "Quem herdou mais (2º vs 1º)",
    tipo: "swing",
    live: true,
    turnos: true,
    explicacao:
      "Variação da margem Lula − Flávio do 1º para o 2º turno (p.p.). Vermelho: Lula ganhou mais terreno que Flávio; azul: Flávio ganhou mais.",
  },
  {
    id: "pt22",
    rotulo: "Lula: variação vs 2022",
    tipo: "swing",
    live: true,
    bloco: "pt",
    explicacao: "Lula 2026 − Lula 2022 (p.p.). Vermelho: Lula subiu; azul: Lula caiu.",
  },
  {
    id: "bo22",
    rotulo: "Flávio vs Jair 2022",
    tipo: "swing",
    live: true,
    bloco: "bolso",
    explicacao: "Flávio 2026 − Jair 2022 (p.p.). Azul: Flávio acima de Jair; vermelho: abaixo.",
  },
  {
    id: "pt18",
    rotulo: "Lula vs Haddad 2018",
    tipo: "swing",
    live: true,
    bloco: "pt",
    explicacao: "Lula 2026 − Haddad 2018 (p.p.). Vermelho: Lula acima de Haddad; azul: abaixo.",
  },
  {
    id: "bo18",
    rotulo: "Flávio vs Jair 2018",
    tipo: "swing",
    live: true,
    bloco: "bolso",
    explicacao: "Flávio 2026 − Jair 2018 (p.p.). Azul: Flávio acima de Jair; vermelho: abaixo.",
  },
  {
    id: "margem22",
    rotulo: "Margem 2022",
    tipo: "margem",
    live: false,
    explicacao: "Resultado final de 2022: Lula − Jair (p.p.). Vermelho: Lula venceu; azul: Jair venceu.",
  },
  {
    id: "margem18",
    rotulo: "Margem 2018",
    tipo: "margem",
    live: false,
    explicacao: "Resultado final de 2018: Haddad − Jair (p.p.). Vermelho: Haddad venceu; azul: Jair venceu.",
  },
];

export const METRICA_POR_ID: Record<MetricaId, Metrica> = Object.fromEntries(METRICAS.map((m) => [m.id, m])) as Record<
  MetricaId,
  Metrica
>;

export function valoresDeLinhas(pt: LinhaComparacao, bo: LinhaComparacao): ValoresLugar {
  return { pt26: pt.p2026, bo26: bo.p2026, pt22: pt.p2022, bo22: bo.p2022, pt18: pt.p2018, bo18: bo.p2018 };
}

/** Valor numérico (p.p.) da métrica para um lugar. */
export function valorMetrica(id: MetricaId, v: ValoresLugar | null | undefined): number | null {
  if (!v) return null;
  switch (id) {
    case "margem26":
      return margem(v.pt26, v.bo26);
    case "margem22":
      return margem(v.pt22, v.bo22);
    case "margem18":
      return margem(v.pt18, v.bo18);
    case "ptT":
      return deltaPP(v.pt26, v.pt1);
    case "boT":
      return deltaPP(v.bo26, v.bo1);
    case "margemT": {
      const a = deltaPP(v.pt26, v.pt1);
      const b = deltaPP(v.bo26, v.bo1);
      return a != null && b != null ? a - b : null;
    }
    case "pt22":
      return deltaPP(v.pt26, v.pt22);
    case "bo22":
      return deltaPP(v.bo26, v.bo22);
    case "pt18":
      return deltaPP(v.pt26, v.pt18);
    case "bo18":
      return deltaPP(v.bo26, v.bo18);
  }
}

/** Cor de preenchimento da métrica (usa as escalas de src/components/map/colors). */
export function corMetrica(id: MetricaId, v: ValoresLugar | null | undefined): string {
  switch (id) {
    case "margem26":
      return marginColor(v?.pt26 ?? null, v?.bo26 ?? null);
    case "margem22":
      return marginColor(v?.pt22 ?? null, v?.bo22 ?? null);
    case "margem18":
      return marginColor(v?.pt18 ?? null, v?.bo18 ?? null);
    default: {
      const d = valorMetrica(id, v);
      // swingColor: positivo = em direção ao PT (vermelho). Para o bloco Bolsonaro, inverte.
      const lado = METRICA_POR_ID[id].bloco === "bolso" && d != null ? -d : d;
      return swingColor(lado);
    }
  }
}

/** Dados de legenda (escala + rótulos) coerentes com corMetrica. */
export function legendaMetrica(id: MetricaId): LegendData {
  switch (id) {
    case "margem26":
      return marginLegend({ title: "Vantagem em 2026" });
    case "margem22":
      return marginLegend({ ptLabel: "Lula", boLabel: "Jair", title: "Vantagem em 2022" });
    case "margem18":
      return marginLegend({ ptLabel: "Haddad", boLabel: "Jair", title: "Vantagem em 2018" });
    case "ptT":
      return { ...swingLegend({ title: "Lula: 2º turno − 1º turno" }), leftLabel: "Lula caiu", rightLabel: "Lula cresceu" };
    case "boT":
      return {
        ...swingLegend({ title: "Flávio: 2º turno − 1º turno" }),
        leftLabel: "Flávio cresceu",
        rightLabel: "Flávio caiu",
      };
    case "margemT":
      return {
        ...swingLegend({ title: "Δ margem Lula − Flávio (2º − 1º turno)" }),
        leftLabel: "Flávio herdou mais",
        rightLabel: "Lula herdou mais",
      };
    case "pt22":
      return { ...swingLegend({ title: "Lula 2026 − Lula 2022" }), leftLabel: "Lula caiu", rightLabel: "Lula subiu" };
    case "pt18":
      return {
        ...swingLegend({ title: "Lula 2026 − Haddad 2018" }),
        leftLabel: "Abaixo de Haddad",
        rightLabel: "Acima de Haddad",
      };
    case "bo22":
      // sinal invertido em corMetrica: azul (esquerda) = Flávio acima de Jair
      return {
        ...swingLegend({ title: "Flávio 2026 − Jair 2022" }),
        leftLabel: "Flávio acima de Jair",
        rightLabel: "Flávio abaixo",
      };
    case "bo18":
      return {
        ...swingLegend({ title: "Flávio 2026 − Jair 2018" }),
        leftLabel: "Flávio acima de Jair",
        rightLabel: "Flávio abaixo",
      };
  }
}
