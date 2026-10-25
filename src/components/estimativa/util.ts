// Helpers puros da aba "Estimativa" (sem hooks — usáveis em qualquer componente).
import { BLOCOS, UF_POR_SIGLA } from "@/lib/config";
import { fmtPP, fmtPct } from "@/lib/format";
import type { BlocoId, CenarioId, EstimativaLugar, EstimativaResponse, Turno } from "@/lib/types";

/** Nome curto do candidato de 2026 por bloco. */
export const NOME_26: Record<BlocoId, string> = { pt: "Lula", bolso: "Flávio" };

export const BLOCOS_ORDEM: BlocoId[] = ["pt", "bolso"];

/** Abaixo deste % apurado a estimativa é muito instável (aviso explícito na UI). */
export const POUCO_APURADO = 10;

export function nomeLugar(uf: string): string {
  if (uf === "br") return "Brasil";
  if (uf === "zz") return "Exterior";
  return UF_POR_SIGLA[uf]?.nome ?? uf.toUpperCase();
}

export function nomeAno(b: BlocoId, ano: "2026" | "2022" | "2018"): string {
  return BLOCOS[b].nomes[ano].replace(" Bolsonaro", "");
}

export const CENARIOS: { id: CenarioId; rotulo: string; explicacao: string }[] = [
  {
    id: "base2022",
    rotulo: "Base 2022 (principal)",
    explicacao:
      "As seções que faltam votam como em 2022, corrigidas pela mudança (swing) já observada nas seções apuradas do mesmo estado.",
  },
  {
    id: "base2018",
    rotulo: "Base 2018",
    explicacao: "O mesmo cálculo, mas usando 2018 (Haddad × Jair) como referência para as seções que faltam.",
  },
  {
    id: "proporcional",
    rotulo: "Proporcional",
    explicacao:
      "Ingênuo: o que falta em cada estado vota igual ao que já foi apurado nele. Não corrige a ordem de chegada das urnas dentro do estado.",
  },
];

export const FONTE_SWING: Record<
  EstimativaLugar["fonteSwing"],
  { rotulo: string; titulo: string; tom: "ok" | "aviso" | "neutro" }
> = {
  proprio: {
    rotulo: "próprio",
    titulo: "Swing medido nas seções já apuradas do próprio estado",
    tom: "ok",
  },
  regiao: {
    rotulo: "região",
    titulo: "Estado ainda sem votos apurados: usa o swing médio dos estados da mesma região",
    tom: "aviso",
  },
  nacional: {
    rotulo: "nacional",
    titulo: "Sem apuração no estado nem na região: usa o swing médio nacional",
    tom: "aviso",
  },
  nenhum: {
    rotulo: "sem dados",
    titulo: "Ainda não há apuração suficiente: as seções restantes repetem o ano-base sem ajuste",
    tom: "neutro",
  },
};

const ok = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/** Faixa nacional do bloco; sem intervalo, usa o próprio valor estimado. */
export function faixaDe(r: EstimativaResponse | null | undefined, b: BlocoId): [number, number] | null {
  const f = r?.intervalo?.[b];
  if (f && ok(f[0]) && ok(f[1])) return f[0] <= f[1] ? [f[0], f[1]] : [f[1], f[0]];
  const v = r?.br?.cenarios.base2022[b].pct;
  return ok(v) ? [v, v] : null;
}

export type TomVeredito = "pt" | "bolso" | "neutro" | "aviso";

export interface Veredito {
  tom: TomVeredito;
  titulo: string;
  detalhe: string;
}

const pct1 = (v: number) => fmtPct(v, 1);

/**
 * Leitura do resultado projetado:
 *  - 1º turno: alguém passa de 50% em toda a faixa? → vence no 1º turno; ninguém chega a 50% → 2º turno provável;
 *    a faixa cruza 50% → indefinido.
 *  - 2º turno: quem lidera e se a faixa cruza 50%.
 */
export function calcularVeredito(r: EstimativaResponse | null | undefined, turno: Turno): Veredito | null {
  const est = r?.br?.cenarios.base2022;
  const fPt = faixaDe(r, "pt");
  const fBo = faixaDe(r, "bolso");
  if (!r?.disponivel || !est || !fPt || !fBo) return null;

  if (turno === 1) {
    if (fPt[0] > 50) {
      return {
        tom: "pt",
        titulo: "Lula venceria no 1º turno",
        detalhe: `Toda a faixa estimada para Lula (${pct1(fPt[0])} a ${pct1(fPt[1])}) fica acima de 50% dos votos válidos.`,
      };
    }
    if (fBo[0] > 50) {
      return {
        tom: "bolso",
        titulo: "Flávio venceria no 1º turno",
        detalhe: `Toda a faixa estimada para Flávio (${pct1(fBo[0])} a ${pct1(fBo[1])}) fica acima de 50% dos votos válidos.`,
      };
    }
    if (fPt[1] < 50 && fBo[1] < 50) {
      const lider: BlocoId = est.pt.pct >= est.bolso.pct ? "pt" : "bolso";
      return {
        tom: "neutro",
        titulo: "2º turno provável",
        detalhe: `Nenhum candidato chega a 50% dos válidos na faixa estimada; ${NOME_26[lider]} terminaria na frente.`,
      };
    }
    const b: BlocoId = fPt[1] >= 50 ? "pt" : "bolso";
    const f = b === "pt" ? fPt : fBo;
    return {
      tom: "aviso",
      titulo: "Indefinido: a faixa cruza 50%",
      detalhe: `A estimativa de ${NOME_26[b]} vai de ${pct1(f[0])} a ${pct1(f[1])} — pode haver vitória no 1º turno ou 2º turno.`,
    };
  }

  // 2º turno
  if (fPt[0] < 50 && fPt[1] > 50) {
    return {
      tom: "aviso",
      titulo: "Disputa indefinida: a faixa cruza 50%",
      detalhe: `Lula aparece entre ${pct1(fPt[0])} e ${pct1(fPt[1])} dos válidos — qualquer um dos dois pode vencer.`,
    };
  }
  const venc: BlocoId = est.pt.pct >= est.bolso.pct ? "pt" : "bolso";
  const f = venc === "pt" ? fPt : fBo;
  return {
    tom: venc,
    titulo: `${NOME_26[venc]} venceria o 2º turno`,
    detalhe: `A faixa estimada para ${NOME_26[venc]} (${pct1(f[0])} a ${pct1(f[1])}) fica inteira acima de 50% dos válidos.`,
  };
}

/** "Lula por 3,2 p.p." / "empate" */
export function textoMargem(m: number | null | undefined, ano: "2026" | "2022" | "2018"): string {
  if (!ok(m)) return "—";
  if (Math.abs(m) < 0.05) return "empate técnico";
  const quem = m > 0 ? nomeAno("pt", ano) : nomeAno("bolso", ano);
  return `${quem} por ${fmtPP(Math.abs(m)).replace(/^[+±]/, "")}`;
}

/** Diferença segura a − b. */
export function dif(a: number | null | undefined, b: number | null | undefined): number | null {
  return ok(a) && ok(b) ? a - b : null;
}

/** Escala linear simples. */
export function escala(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Domínio "redondo" que inclui todos os valores (múltiplos de `passo`), dentro de [0, 100]. */
export function dominioPct(valores: (number | null | undefined)[], passo = 5, folga = 2, incluir?: number): [number, number] {
  const vs = valores.filter(ok);
  if (incluir != null) vs.push(incluir);
  if (!vs.length) return [0, 100];
  let lo = Math.floor((Math.min(...vs) - folga) / passo) * passo;
  let hi = Math.ceil((Math.max(...vs) + folga) / passo) * passo;
  lo = Math.max(0, lo);
  hi = Math.min(100, hi);
  if (hi - lo < passo * 2) {
    hi = Math.min(100, lo + passo * 2);
    lo = Math.max(0, hi - passo * 2);
  }
  return [lo, hi];
}
