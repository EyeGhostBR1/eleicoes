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
import type { LinhaTurnos } from "@/lib/turnos";
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
  /**
   * 1º × 2º turno de 2026 (só na página do 2º turno; null até a apuração do lugar terminar):
   * crescimento dos votos de cada um vs os próprios votos do 1º turno (%) e saldo de votos novos
   * (votos ganhos por Lula − por Flávio, em % dos válidos do 1º turno).
   */
  gpt?: number | null;
  gbo?: number | null;
  saldoT?: number | null;
  /** votos no 1º e no 2º turno (tooltip) */
  vt?: { pt1: number | null; bo1: number | null; pt2: number | null; bo2: number | null } | null;
}

/** Campos de ValoresLugar da comparação entre turnos, a partir de uma LinhaTurnos. */
export function valoresTurnos(l: LinhaTurnos): Pick<ValoresLugar, "gpt" | "gbo" | "saldoT" | "vt"> {
  return {
    gpt: l.pt.cresc,
    gbo: l.bo.cresc,
    saldoT: l.saldo,
    vt: l.t1 ? { pt1: l.pt.v1, bo1: l.bo.v1, pt2: l.t2 ? l.pt.v2 : null, bo2: l.t2 ? l.bo.v2 : null } : null,
  };
}

export interface Metrica {
  id: MetricaId;
  rotulo: string;
  tipo: "margem" | "swing";
  /** precisa de dados de 2026 */
  live: boolean;
  /** compara 1º × 2º turno de 2026 (só no 2º turno) */
  turnos?: boolean;
  /** saturação da escala de cor (padrão 15) */
  escala?: number;
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
    rotulo: "Lula: votos 2º vs 1º turno",
    tipo: "swing",
    live: true,
    turnos: true,
    bloco: "pt",
    escala: 30,
    explicacao:
      "Crescimento dos votos de Lula no 2º turno em relação aos votos dele no 1º turno (%). Vermelho: ganhou votos; azul: perdeu. Só lugares com a apuração concluída.",
  },
  {
    id: "boT",
    rotulo: "Flávio: votos 2º vs 1º turno",
    tipo: "swing",
    live: true,
    turnos: true,
    bloco: "bolso",
    escala: 30,
    explicacao:
      "Crescimento dos votos de Flávio no 2º turno em relação aos votos dele no 1º turno (%). Azul: ganhou votos; vermelho: perdeu. Só lugares com a apuração concluída.",
  },
  {
    id: "margemT",
    rotulo: "Quem ganhou mais votos",
    tipo: "swing",
    live: true,
    turnos: true,
    escala: 10,
    explicacao:
      "Votos ganhos por Lula − votos ganhos por Flávio entre os turnos, em % dos votos válidos do 1º turno. Vermelho: Lula ganhou mais; azul: Flávio ganhou mais. Só lugares com a apuração concluída.",
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
      return v.gpt ?? null;
    case "boT":
      return v.gbo ?? null;
    case "margemT":
      return v.saldoT ?? null;
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
      return swingColor(lado, METRICA_POR_ID[id].escala);
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
      return {
        ...swingLegend({ title: "Votos de Lula: 2º vs 1º turno (%)", maxAbs: 30 }),
        leftLabel: "Lula perdeu votos",
        rightLabel: "Lula ganhou votos",
      };
    case "boT":
      return {
        ...swingLegend({ title: "Votos de Flávio: 2º vs 1º turno (%)", maxAbs: 30 }),
        leftLabel: "Flávio ganhou votos",
        rightLabel: "Flávio perdeu votos",
      };
    case "margemT":
      return {
        ...swingLegend({ title: "Votos ganhos: Lula − Flávio (% dos válidos do 1º turno)", maxAbs: 10 }),
        leftLabel: "Flávio ganhou mais",
        rightLabel: "Lula ganhou mais",
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
