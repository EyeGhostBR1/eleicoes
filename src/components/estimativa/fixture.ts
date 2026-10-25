// Gerador de dados FICTÍCIOS de /api/estimativa para desenvolvimento (componentes são puros,
// dirigidos por props). Usado pela página em `next dev` com ?demo=<% apurado> e por scripts.
// NUNCA usar em produção — os números são inventados a partir de 2022 com swings arbitrários.
import { UFS } from "@/lib/config";
import type {
  CenarioId,
  EstimativaCenario,
  EstimativaLugar,
  EstimativaResponse,
  HistBrFile,
  HistResult,
  Turno,
} from "@/lib/types";
import { type PontoEvolucao, pontoDe } from "./historico";

/** Velocidade relativa de apuração por região (Sul/Sudeste totalizam antes — viés de ordem). */
const VELOCIDADE: Record<string, number> = {
  Sul: 1.7,
  Sudeste: 1.4,
  "Centro-Oeste": 1.25,
  Nordeste: 0.75,
  Norte: 0.7,
  Exterior: 0.5,
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** pseudoaleatório determinístico em [−0,5, 0,5) por chave */
function ruido(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000 - 0.5;
}

function margemDemo(pa: number): number {
  if (pa < 10) return 3;
  if (pa < 30) return 2;
  if (pa < 50) return 1.3;
  if (pa < 70) return 0.8;
  if (pa < 90) return 0.4;
  return 0.2;
}

function cenario(id: CenarioId, vv: number, ptPct: number, boPct: number): EstimativaCenario {
  const pt = (vv * ptPct) / 100;
  const bo = (vv * boPct) / 100;
  return {
    id,
    pt: { votos: pt, pct: ptPct },
    bolso: { votos: bo, pct: boPct },
    outros: { votos: Math.max(0, vv - pt - bo), pct: Math.max(0, 100 - ptPct - boPct) },
    validos: vv,
  };
}

const pctH = (h: HistResult | undefined, k: "pt" | "bo") => (h && h.vv > 0 ? (h[k] / h.vv) * 100 : null);

function horario(turno: Turno, pa: number): string {
  const base = Date.parse(turno === 1 ? "2026-10-04T17:00:00-03:00" : "2026-10-25T17:00:00-03:00");
  const ms = base + Math.round(pa * 3.6) * 60_000;
  // ISO com offset −03:00
  const d = new Date(ms - 3 * 3600_000);
  return d.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

/**
 * Resposta fictícia com `pctAlvo` (0–100) de seções apuradas no país.
 * "Verdade" simulada: Lula −1,2 p.p. e Flávio −3,5 p.p. vs 2022 (1º turno), com ruído por UF;
 * o parcial de cada UF começa menos favorável a Lula e converge para o final.
 */
export function gerarFixtureEstimativa(hist: HistBrFile, pctAlvo: number, turno: Turno): EstimativaResponse {
  const t = clamp(pctAlvo, 0, 100) / 100;
  const k = String(turno) as "1" | "2";
  const ufs: Record<string, EstimativaLugar> = {};
  const soma = {
    vvF: 0,
    vvC: 0,
    ptC: 0,
    boC: 0,
    c: { base2022: [0, 0, 0], base2018: [0, 0, 0], proporcional: [0, 0, 0] } as Record<CenarioId, number[]>,
  };

  for (const u of UFS) {
    const h22 = hist.ufs[u.sigla]?.["2022"]?.[k];
    const h18 = hist.ufs[u.sigla]?.["2018"]?.[k];
    if (!h22 || !(h22.vv > 0)) continue;
    const vel = VELOCIDADE[u.regiao] ?? 1;
    const pa = t >= 1 ? 100 : 100 * (1 - Math.pow(1 - t, vel));
    const r = ruido(u.sigla);
    const p22 = pctH(h22, "pt") ?? 0;
    const b22 = pctH(h22, "bo") ?? 0;
    const p18 = pctH(h18, "pt");
    const b18 = pctH(h18, "bo");

    const ptF = clamp(p22 + (turno === 1 ? -1.2 : -0.6) + r * 3, 1, 98);
    const boF = turno === 2 ? 100 - ptF : clamp(b22 - 3.5 - r * 2, 1, 99 - ptF);
    const vvF = h22.vv * 1.04;
    const vvC = (vvF * pa) / 100;
    const resto = 1 - pa / 100;
    const vies = 2.5 * resto;
    const ptP = pa > 0 ? ptF - vies : null;
    const boP = ptP == null ? null : turno === 2 ? 100 - ptP : boF + vies * 0.8;

    const e22pt = ptF + 0.4 * r * resto;
    const e18pt = ptF + 1.2 * resto;
    const cen: Record<CenarioId, EstimativaCenario> = {
      base2022: cenario("base2022", vvF, e22pt, turno === 2 ? 100 - e22pt : boF - 0.4 * r * resto),
      base2018: cenario("base2018", vvF, e18pt, turno === 2 ? 100 - e18pt : boF - 0.9 * resto),
      proporcional:
        ptP != null && boP != null
          ? cenario("proporcional", vvF, ptP, boP)
          : cenario("proporcional", vvF, e22pt, turno === 2 ? 100 - e22pt : boF),
    };
    for (const id of Object.keys(cen) as CenarioId[]) {
      soma.c[id][0] += cen[id].pt.votos;
      soma.c[id][1] += cen[id].bolso.votos;
      soma.c[id][2] += cen[id].validos;
    }
    soma.vvF += vvF;
    soma.vvC += vvC;
    soma.ptC += ptP != null ? (vvC * ptP) / 100 : 0;
    soma.boC += boP != null ? (vvC * boP) / 100 : 0;

    ufs[u.sigla] = {
      uf: u.sigla,
      pctTotalizado: pa,
      parcial: { pt: ptP, bolso: boP, validos: vvC },
      cenarios: cen,
      swing: {
        base2022: { pt: ptF - p22, bolso: boF - b22 },
        base2018: { pt: p18 == null ? null : ptF - p18, bolso: b18 == null ? null : boF - b18 },
      },
      fonteSwing: pa > 0.05 ? "proprio" : "regiao",
      validosRestantes: vvF - vvC,
      final2022: { pt: p22, bolso: b22 },
      final2018: { pt: p18, bolso: b18 },
    };
  }

  const paBr = soma.vvF > 0 ? (soma.vvC / soma.vvF) * 100 : 0;
  const br22 = hist.br["2022"]?.[k];
  const br18 = hist.br["2018"]?.[k];
  const cenBr = Object.fromEntries(
    (Object.keys(soma.c) as CenarioId[]).map((id) => {
      const [pt, bo, vv] = soma.c[id];
      return [id, cenario(id, vv, (pt / vv) * 100, (bo / vv) * 100)];
    }),
  ) as Record<CenarioId, EstimativaCenario>;
  const disponivel = paBr > 0;
  const margem = margemDemo(paBr);
  const faixa = (b: "pt" | "bolso"): [number, number] => {
    const vs = Object.values(cenBr).map((c) => c[b].pct);
    return [Math.min(...vs) - margem, Math.max(...vs) + margem];
  };

  return {
    turno,
    ambiente: "oficial",
    geradoEm: new Date().toISOString(),
    atualizadoEm: disponivel ? horario(turno, paBr) : null,
    disponivel,
    motivo: disponivel ? undefined : "Demonstração: nenhuma seção apurada.",
    br: disponivel
      ? {
          uf: "br",
          pctTotalizado: paBr,
          parcial: {
            pt: soma.vvC > 0 ? (soma.ptC / soma.vvC) * 100 : null,
            bolso: soma.vvC > 0 ? (soma.boC / soma.vvC) * 100 : null,
            validos: soma.vvC,
          },
          cenarios: cenBr,
          swing: {
            base2022: { pt: cenBr.base2022.pt.pct - (pctH(br22, "pt") ?? 0), bolso: cenBr.base2022.bolso.pct - (pctH(br22, "bo") ?? 0) },
            base2018: { pt: cenBr.base2018.pt.pct - (pctH(br18, "pt") ?? 0), bolso: cenBr.base2018.bolso.pct - (pctH(br18, "bo") ?? 0) },
          },
          fonteSwing: "proprio",
          validosRestantes: soma.vvF - soma.vvC,
          final2022: { pt: pctH(br22, "pt"), bolso: pctH(br22, "bo") },
          final2018: { pt: pctH(br18, "pt"), bolso: pctH(br18, "bo") },
        }
      : null,
    ufs: disponivel ? ufs : {},
    intervalo: disponivel ? { pt: faixa("pt"), bolso: faixa("bolso") } : null,
    margemHistorica: disponivel ? margem : null,
  };
}

/** Série fictícia para o gráfico "Evolução da noite" (de ~0,5% até pctAlvo). */
export function gerarSerieDemo(hist: HistBrFile, pctAlvo: number, turno: Turno): PontoEvolucao[] {
  const out: PontoEvolucao[] = [];
  const fim = clamp(pctAlvo, 0, 100);
  for (let p = 0.5; p < fim; p += p < 5 ? 0.5 : p < 20 ? 1.5 : 3) {
    const pt = pontoDe(gerarFixtureEstimativa(hist, p, turno));
    if (pt) out.push(pt);
  }
  const ult = pontoDe(gerarFixtureEstimativa(hist, fim, turno));
  if (ult) out.push(ult);
  return out;
}
