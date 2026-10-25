// Modelo de projeção do resultado final a partir da apuração parcial (isomórfico, sem APIs do Node).
//
// "Swing uniforme por UF ajustado pela composição do apurado":
//   Para cada UF u (27 UFs + "zz" exterior) e cada ano-base Y ∈ {2022, 2018} (mesmo turno):
//     f_m = fração das seções totalizadas no município m (0 se ausente)
//     Bc  = Σ_m f_m·H_m        (parte JÁ apurada, medida no ano-base)
//     Br  = Σ_m (1 − f_m)·H_m  (parte AINDA NÃO apurada, medida no ano-base)
//     (H_m = {pt, bo, vv} do ano Y no município m; municípios sem histórico são ignorados)
//   Se a UF tem votos válidos apurados V > 0 e Bc.vv > 0 ("proprio"):
//     swingPt = P/V − Bc.pt/Bc.vv ;  swingBo = B/V − Bc.bo/Bc.vv ;  crescimento = V/Bc.vv
//   senão: média ponderada (por V) do swing/crescimento das UFs da mesma região com apuração
//   ("regiao"); senão das UFs do país ("nacional"); senão swing 0 e crescimento = razão do
//   eleitorado nacional (se informado) ou 1 ("nenhum").
//   Restante: Vr = Br.vv·crescimento ; Pr = clamp(Br.pt/Br.vv + swingPt)·Vr ; Bor = clamp(Br.bo/Br.vv + swingBo)·Vr
//   (se as duas fatias somarem > 100%, são reescaladas proporcionalmente).
//   Final da UF: pt = P + Pr ; bolso = B + Bor ; validos = V + Vr ; outros = validos − pt − bolso.
//   Cenário "proporcional": o restante da UF vota como a parte já apurada da UF (P/V, B/V), com o
//   MESMO volume Vr do cenário principal (fallback região → nacional pelos totais apurados).
//   Brasil = soma das UFs (inclui "zz"). Cenário principal = base2022 (configurável p/ backtest).
//   Intervalo nacional = [mín, máx] dos três cenários ± margem histórica (backtest, por % apurado).
//
// Desvios/complementos documentados em relação à especificação:
//   1. Se V = 0 na UF (sem apuração), todos os f_m da UF são tratados como 0 — a UF inteira é
//      "restante" — mesmo que o progresso indique seções (evita contar a parte apurada como 0 votos).
//   2. Se a UF tem V > 0 mas nenhum município com histórico tem f_m > 0 (acompanhamento ausente),
//      usa progresso UNIFORME f_m = pctTotalizado/100 (o servidor já faz isso; aqui é só defesa).
//   3. Se pctTotalizado ≥ 100 na UF, todos os f_m = 1 (restante = 0), independente do progresso.
//   4. br.pctTotalizado = opts.pctTotalizadoBr (valor oficial do TSE, por seções) quando
//      informado; senão Σ_u pct_u·w_u / Σ_u w_u com w_u = eleitorado 2026 (proxy das seções) quando
//      informado em todas as UFs, ou os válidos estimados do cenário principal.
//   5. Crescimento do fallback "nenhum" usa Σ eleitorado/Σ aptos do ano-base apenas quando
//      `eleitorado` for informado em todas as entradas; senão 1. (Só ocorre sem apuração alguma,
//      caso em que o resultado sai com disponivel = false.)
//   6. Swing exibido (EstimativaLugar.swing) é o efetivamente usado (próprio ou de fallback), em p.p.;
//      null quando fonteSwing = "nenhum". Para o Brasil é o swing agregado: ΣP/ΣV − ΣBc.pt/ΣBc.vv.
//   7. Progresso dessincronizado dos totais da UF (o -ab.json e o resultado da UF são arquivos
//      diferentes no CDN do TSE): se q = Σ f_m·ap_m / Σ ap_m (eleitorado histórico) e p = pct da UF
//      divergem mais de 2× na parte apurada (q/p) ou na restante ((1−q)/(1−p)), usa progresso
//      UNIFORME f_m = p. Sem isso, crescimento = V/Bc.vv explode (progresso em 1% com a UF em 5% →
//      UF contada ~5×). No backtest (sem dessincronia) a regra nunca dispara.
//   8. Crescimento próprio absurdo (fora de [0,1; 10]) é descartado → swing/crescimento de fallback
//      (região → nacional). Último recurso: no backtest fica em [0,77; 1,33] (exterior 0,35–5,5).
//   9. Margem do intervalo limitada ao teto matemático 100·R'/(V+R') p.p., com R' = 1,5 × válidos
//      restantes estimados: no fim da apuração a margem → 0 e o intervalo colapsa no apurado.
//      `margemHistorica` devolvida é a margem efetivamente aplicada.
//  10. Votos ao vivo inconsistentes (pt + bolso > válidos) são reescalados para caber nos válidos.
import { UF_POR_SIGLA } from "../config";
import type {
  AnoHist,
  CenarioId,
  EstimativaCenario,
  EstimativaLugar,
  EstimativaResponse,
  HistByYear,
  HistMunFile,
  HistResult,
  Turno,
} from "../types";

export interface LiveUF {
  /** votos válidos já apurados */
  vv: number;
  /** votos do bloco PT já apurados */
  pt: number;
  /** votos do bloco Bolsonaro já apurados */
  bo: number;
  /** % de seções totalizadas na UF (0–100) */
  pctTotalizado: number;
}

export interface EntradaUF {
  /** sigla minúscula ("sp", ..., "zz") */
  uf: string;
  live: LiveUF | null;
  /** código TSE do município (5 dígitos) → fração de seções totalizadas (0..1) */
  progresso: Record<string, number>;
  /** histórico por município da UF (public/data/hist/mun/{uf}.json) */
  hist: HistMunFile;
  /** histórico agregado da UF (br.json → ufs[uf]); se ausente, soma os municípios */
  histUf?: HistByYear;
  /** eleitorado 2026 da UF (opcional; usado só no fallback "nenhum") */
  eleitorado?: number;
}

export interface OpcoesEstimativa {
  /** histórico agregado do Brasil (br.json → br); se ausente, soma as UFs */
  histBr?: HistByYear;
  /** margem histórica (p.p.) para o % apurado nacional — ver ./margens (margemPara) */
  margemHistorica?: (pctApurado: number) => number | null;
  /**
   * Ano-base do cenário principal (default "2022"): define validosRestantes, o volume do
   * cenário "proporcional" e o crescimento de fallback. O backtest usa "2018".
   */
  anoPrincipal?: AnoHist;
  /** % de seções totalizadas no Brasil informado pelo TSE (0–100). Recomendado. */
  pctTotalizadoBr?: number;
  /** cenários que entram no [mín, máx] do intervalo nacional (default: os três) */
  cenariosIntervalo?: CenarioId[];
}

export interface ResultadoEstimativa {
  br: EstimativaLugar | null;
  ufs: Record<string, EstimativaLugar>;
  intervalo: EstimativaResponse["intervalo"];
  margemHistorica: number | null;
  disponivel: boolean;
  motivo?: string;
}

export const CENARIOS: CenarioId[] = ["base2022", "base2018", "proporcional"];
const ANOS: AnoHist[] = ["2022", "2018"];
export const MOTIVO_SEM_APURACAO = "A apuração ainda não começou";

type FonteSwing = EstimativaLugar["fonteSwing"];

interface Tri {
  vv: number;
  pt: number;
  bo: number;
}

const zero = (): Tri => ({ vv: 0, pt: 0, bo: 0 });
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const fin = (x: number) => (isFinite(x) ? x : 0);

/** Soma o histórico de todos os municípios de uma UF para ano/turno. */
export function somarHistMun(hist: HistMunFile, ano: AnoHist, turno: Turno): HistResult | null {
  const t = String(turno) as "1" | "2";
  const acc: HistResult = { ap: 0, comp: 0, abst: 0, vv: 0, vb: 0, vn: 0, pt: 0, bo: 0 };
  let n = 0;
  for (const cd in hist) {
    const h = hist[cd]?.[ano]?.[t];
    if (!h) continue;
    n++;
    acc.ap += h.ap;
    acc.comp += h.comp;
    acc.abst += h.abst;
    acc.vv += h.vv;
    acc.vb += h.vb;
    acc.vn += h.vn;
    acc.pt += h.pt;
    acc.bo += h.bo;
  }
  return n ? acc : null;
}

function pctOuNull(parte: number, total: number): number | null {
  return total > 0 && isFinite(parte) ? (parte / total) * 100 : null;
}

/** Fatias (0..1) com clamp e reescala quando pt + bo > 1. */
function fatias(pt: number, bo: number): [number, number] {
  let a = clamp01(fin(pt));
  let b = clamp01(fin(bo));
  const s = a + b;
  if (s > 1) {
    a /= s;
    b /= s;
  }
  return [a, b];
}

function cenario(id: CenarioId, pt: number, bo: number, validos: number): EstimativaCenario {
  const outros = Math.max(0, validos - pt - bo);
  const p = (v: number) => (validos > 0 ? (v / validos) * 100 : 0);
  return {
    id,
    pt: { votos: pt, pct: p(pt) },
    bolso: { votos: bo, pct: p(bo) },
    outros: { votos: outros, pct: p(outros) },
    validos,
  };
}

interface SwingInfo {
  pt: number;
  bo: number;
  growth: number;
}

interface EstadoUF {
  uf: string;
  regiao: string;
  pctTotalizado: number;
  /** apurado ao vivo (após as regras de defesa) */
  V: number;
  P: number;
  B: number;
  /** base apurada / restante por ano */
  bc: Record<AnoHist, Tri>;
  br: Record<AnoHist, Tri>;
  ap: Record<AnoHist, number>;
  /** swing próprio por ano (null se a UF não tem apuração utilizável) */
  proprio: Record<AnoHist, SwingInfo | null>;
  hist: HistMunFile;
  histUf?: HistByYear;
  eleitorado?: number;
}

/**
 * Razão máxima tolerada entre o % apurado implícito no progresso por município (ponderado pelo
 * eleitorado histórico) e o % de seções da UF no resultado ao vivo — tanto na parte apurada (q/p)
 * quanto na restante ((1−q)/(1−p)). Divergência legítima (seções de tamanhos diferentes) medida no
 * acompanhamento real de SP/SE: 0,87–1,06 no agregado (um município isolado: 0,25–1,33). Acima disso
 * os dois arquivos do TSE estão dessincronizados (CDN/cache: o -ab.json atrás ou à frente dos totais)
 * e o "crescimento" V/Bc.vv explodiria (ex.: progresso em 1% com a UF em 5% → crescimento 5× → UF
 * inteira contada 5 vezes). O servidor já concilia por seções (conciliarProgresso); isto é a defesa
 * para entradas não conciliadas, por isso a tolerância larga (2×).
 */
const RAZAO_MAX_PROGRESSO = 2;
/** Abaixo deste % de seções (0–1) o teste acima não é confiável (arredondamento do pstn). */
const P_MIN_TESTE_PROGRESSO = 0.001;
/**
 * Último recurso: crescimento V/Bc.vv fora desta faixa é absurdo → swing próprio descartado (fallback).
 * Real: UFs 0,77–1,33 no backtest, exterior 0,35–5,5 (cidades do exterior mudam muito). Faixa larga de
 * propósito: o simulado do TSE (dados fictícios, ex.: AP ×0,20) precisa continuar reproduzindo o 100%.
 */
const CRESC_MIN = 0.1;
const CRESC_MAX = 10;

/** Fração de seções por município a usar no modelo (regras de defesa 1–3 e 7). */
function fracoes(e: EntradaUF, V: number, t: "1" | "2"): (cd: string) => number {
  const live = e.live;
  if (!live || V <= 0) return () => 0;
  if (live.pctTotalizado >= 100) return () => 1;
  const p = clamp01(fin(live.pctTotalizado) / 100);
  const uniforme = () => p;
  let algum = false;
  for (const cd in e.progresso) {
    if ((e.progresso[cd] ?? 0) > 0 && e.hist[cd]) {
      algum = true;
      break;
    }
  }
  if (!algum) return uniforme;
  const f = (cd: string) => clamp01(fin(e.progresso[cd] ?? 0));
  // Regra 7: progresso inconsistente com o % de seções da UF → uniforme.
  if (p >= P_MIN_TESTE_PROGRESSO && p < 1) {
    let num = 0;
    let den = 0;
    for (const cd in e.hist) {
      const hm = e.hist[cd];
      const ap = fin(hm?.["2022"]?.[t]?.ap ?? hm?.["2018"]?.[t]?.ap ?? 0);
      if (!(ap > 0)) continue;
      num += f(cd) * ap;
      den += ap;
    }
    if (den > 0) {
      const q = num / den;
      const r1 = q / p;
      const r2 = (1 - q) / (1 - p);
      const lo = 1 / RAZAO_MAX_PROGRESSO;
      if (!(r1 >= lo && r1 <= RAZAO_MAX_PROGRESSO && r2 >= lo && r2 <= RAZAO_MAX_PROGRESSO)) return uniforme;
    }
  }
  return f;
}

function prepararUF(e: EntradaUF, turno: Turno): EstadoUF {
  const t = String(turno) as "1" | "2";
  const V = Math.max(0, fin(e.live?.vv ?? 0));
  let P = Math.max(0, fin(e.live?.pt ?? 0));
  let B = Math.max(0, fin(e.live?.bo ?? 0));
  // Defesa: blocos nunca acima dos válidos (dados ao vivo inconsistentes → % > 100 e intervalo invertido)
  if (P + B > V) {
    const k = V > 0 ? V / (P + B) : 0;
    P *= k;
    B *= k;
  }
  const f = fracoes(e, V, t);
  const bc = { "2022": zero(), "2018": zero() } as Record<AnoHist, Tri>;
  const br = { "2022": zero(), "2018": zero() } as Record<AnoHist, Tri>;
  const ap = { "2022": 0, "2018": 0 } as Record<AnoHist, number>;
  for (const cd in e.hist) {
    const fm = f(cd);
    const hm = e.hist[cd];
    for (const ano of ANOS) {
      const h = hm?.[ano]?.[t];
      if (!h) continue;
      const c = bc[ano];
      const r = br[ano];
      c.vv += fm * h.vv;
      c.pt += fm * h.pt;
      c.bo += fm * h.bo;
      r.vv += (1 - fm) * h.vv;
      r.pt += (1 - fm) * h.pt;
      r.bo += (1 - fm) * h.bo;
      ap[ano] += h.ap;
    }
  }
  const proprio = {} as Record<AnoHist, SwingInfo | null>;
  for (const ano of ANOS) {
    const c = bc[ano];
    const growth = c.vv > 0 ? V / c.vv : NaN;
    // Regra 8: crescimento implausível (progresso × totais dessincronizados sem ser detectado pela
    // regra 7, ex.: pct arredondado a 0) → sem swing próprio; usa região/nacional.
    proprio[ano] =
      V > 0 && c.vv > 0 && growth >= CRESC_MIN && growth <= CRESC_MAX
        ? { pt: P / V - c.pt / c.vv, bo: B / V - c.bo / c.vv, growth }
        : null;
  }
  return {
    uf: e.uf,
    regiao: UF_POR_SIGLA[e.uf]?.regiao ?? "?",
    pctTotalizado: Math.max(0, Math.min(100, fin(e.live?.pctTotalizado ?? 0))),
    V,
    P,
    B,
    bc,
    br,
    ap,
    proprio,
    hist: e.hist,
    histUf: e.histUf,
    eleitorado: e.eleitorado,
  };
}

/** Média ponderada por V dos swings próprios de um grupo de UFs. */
function mediaSwing(grupo: EstadoUF[], ano: AnoHist): SwingInfo | null {
  let w = 0;
  let pt = 0;
  let bo = 0;
  let g = 0;
  for (const s of grupo) {
    const sw = s.proprio[ano];
    if (!sw) continue;
    w += s.V;
    pt += s.V * sw.pt;
    bo += s.V * sw.bo;
    g += s.V * sw.growth;
  }
  return w > 0 ? { pt: pt / w, bo: bo / w, growth: g / w } : null;
}

/** Fatias apuradas agregadas (ΣP/ΣV, ΣB/ΣV) de um grupo de UFs. */
function fatiaApurada(grupo: EstadoUF[]): { pt: number; bo: number } | null {
  let V = 0;
  let P = 0;
  let B = 0;
  for (const s of grupo) {
    V += s.V;
    P += s.P;
    B += s.B;
  }
  return V > 0 ? { pt: P / V, bo: B / V } : null;
}

function finalHist(h: HistResult | null | undefined): { pt: number | null; bolso: number | null } {
  if (!h) return { pt: null, bolso: null };
  return { pt: pctOuNull(h.pt, h.vv), bolso: pctOuNull(h.bo, h.vv) };
}

/**
 * Estima o resultado final (Brasil, UFs e exterior) a partir da apuração parcial.
 * Função pura: não faz I/O.
 */
export function estimar(entradas: EntradaUF[], turno: Turno, opts: OpcoesEstimativa = {}): ResultadoEstimativa {
  const t = String(turno) as "1" | "2";
  const principal: AnoHist = opts.anoPrincipal ?? "2022";
  const estados = entradas.map((e) => prepararUF(e, turno));

  if (!estados.some((s) => s.V > 0)) {
    return {
      br: null,
      ufs: {},
      intervalo: null,
      margemHistorica: null,
      disponivel: false,
      motivo: MOTIVO_SEM_APURACAO,
    };
  }

  // Agregados para fallback (região → nacional)
  const porRegiao = new Map<string, EstadoUF[]>();
  for (const s of estados) {
    const l = porRegiao.get(s.regiao) ?? [];
    l.push(s);
    porRegiao.set(s.regiao, l);
  }
  const swingRegiao = new Map<string, Record<AnoHist, SwingInfo | null>>();
  const fatiaRegiao = new Map<string, { pt: number; bo: number } | null>();
  for (const [reg, grupo] of porRegiao) {
    swingRegiao.set(reg, { "2022": mediaSwing(grupo, "2022"), "2018": mediaSwing(grupo, "2018") });
    fatiaRegiao.set(reg, fatiaApurada(grupo));
  }
  const swingNacional: Record<AnoHist, SwingInfo | null> = {
    "2022": mediaSwing(estados, "2022"),
    "2018": mediaSwing(estados, "2018"),
  };
  const fatiaNacional = fatiaApurada(estados);

  // Crescimento de fallback "nenhum": razão do eleitorado nacional (se informado em todas as UFs)
  const crescNenhum = {} as Record<AnoHist, number>;
  for (const ano of ANOS) {
    const todosEleit = entradas.every((e) => e.eleitorado != null && e.eleitorado > 0);
    const eleit = entradas.reduce((a, e) => a + (e.eleitorado ?? 0), 0);
    const apAno = estados.reduce((a, s) => a + s.ap[ano], 0);
    crescNenhum[ano] = todosEleit && apAno > 0 ? eleit / apAno : 1;
  }

  function swingPara(s: EstadoUF, ano: AnoHist): { sw: SwingInfo; fonte: FonteSwing } {
    const p = s.proprio[ano];
    if (p) return { sw: p, fonte: "proprio" };
    const r = s.regiao !== "Exterior" ? swingRegiao.get(s.regiao)?.[ano] : null;
    if (r) return { sw: r, fonte: "regiao" };
    const n = swingNacional[ano];
    if (n) return { sw: n, fonte: "nacional" };
    return { sw: { pt: 0, bo: 0, growth: crescNenhum[ano] }, fonte: "nenhum" };
  }

  function fatiaPara(s: EstadoUF): { pt: number; bo: number } | null {
    if (s.V > 0) return { pt: s.P / s.V, bo: s.B / s.V };
    const r = s.regiao !== "Exterior" ? fatiaRegiao.get(s.regiao) : null;
    if (r) return r;
    return fatiaNacional;
  }

  const ufs: Record<string, EstimativaLugar> = {};
  // acumuladores nacionais
  const somaCen = {} as Record<CenarioId, Tri>;
  for (const c of CENARIOS) somaCen[c] = zero();
  const somaBc = { "2022": zero(), "2018": zero() } as Record<AnoHist, Tri>;
  let somaPctPeso = 0;
  let somaPeso = 0;
  const pesoPorEleitorado = estados.every((s) => s.eleitorado != null && isFinite(s.eleitorado) && s.eleitorado > 0);
  let V = 0;
  let P = 0;
  let B = 0;
  let restantesBr = 0;

  for (const s of estados) {
    const cens = {} as Record<CenarioId, EstimativaCenario>;
    const swingOut = {} as EstimativaLugar["swing"];
    let fontePrincipal: FonteSwing = "nenhum";
    const VrPorAno = {} as Record<AnoHist, number>;

    for (const ano of ANOS) {
      const { sw, fonte } = swingPara(s, ano);
      const r = s.br[ano];
      const Vr = Math.max(0, fin(r.vv * sw.growth));
      VrPorAno[ano] = Vr;
      let Pr = 0;
      let Bor = 0;
      if (r.vv > 0 && Vr > 0) {
        const [a, b] = fatias(r.pt / r.vv + sw.pt, r.bo / r.vv + sw.bo);
        Pr = a * Vr;
        Bor = b * Vr;
      }
      const id = `base${ano}` as CenarioId;
      cens[id] = cenario(id, s.P + Pr, s.B + Bor, s.V + Vr);
      swingOut[id as "base2022" | "base2018"] =
        fonte === "nenhum" ? { pt: null, bolso: null } : { pt: sw.pt * 100, bolso: sw.bo * 100 };
      if (ano === principal) fontePrincipal = fonte;
    }

    // Proporcional: restante vota como o apurado da UF (fallback região/nacional), volume do principal
    {
      const Vr = VrPorAno[principal];
      const fa = fatiaPara(s);
      let Pr = 0;
      let Bor = 0;
      if (Vr > 0) {
        if (fa) {
          const [a, b] = fatias(fa.pt, fa.bo);
          Pr = a * Vr;
          Bor = b * Vr;
        } else {
          const r = s.br[principal];
          if (r.vv > 0) {
            const [a, b] = fatias(r.pt / r.vv, r.bo / r.vv);
            Pr = a * Vr;
            Bor = b * Vr;
          }
        }
      }
      cens.proporcional = cenario("proporcional", s.P + Pr, s.B + Bor, s.V + Vr);
    }

    const hUf22 = s.histUf?.["2022"]?.[t] ?? somarHistMun(s.hist, "2022", turno);
    const hUf18 = s.histUf?.["2018"]?.[t] ?? somarHistMun(s.hist, "2018", turno);
    const principalId = `base${principal}` as CenarioId;

    ufs[s.uf] = {
      uf: s.uf,
      pctTotalizado: s.pctTotalizado,
      parcial: { pt: pctOuNull(s.P, s.V), bolso: pctOuNull(s.B, s.V), validos: s.V },
      cenarios: cens,
      swing: swingOut,
      fonteSwing: fontePrincipal,
      validosRestantes: VrPorAno[principal],
      final2022: finalHist(hUf22),
      final2018: finalHist(hUf18),
    };

    for (const c of CENARIOS) {
      somaCen[c].vv += cens[c].validos;
      somaCen[c].pt += cens[c].pt.votos;
      somaCen[c].bo += cens[c].bolso.votos;
    }
    for (const ano of ANOS) {
      somaBc[ano].vv += s.bc[ano].vv;
      somaBc[ano].pt += s.bc[ano].pt;
      somaBc[ano].bo += s.bc[ano].bo;
    }
    // % de seções ∝ eleitorado: pondera pelo eleitorado 2026 quando informado em todas as UFs
    const peso = pesoPorEleitorado ? (s.eleitorado ?? 0) : cens[principalId].validos;
    somaPctPeso += s.pctTotalizado * peso;
    somaPeso += peso;
    V += s.V;
    P += s.P;
    B += s.B;
    restantesBr += VrPorAno[principal];
  }

  // Brasil
  const cenBr = {} as Record<CenarioId, EstimativaCenario>;
  for (const c of CENARIOS) cenBr[c] = cenario(c, somaCen[c].pt, somaCen[c].bo, somaCen[c].vv);
  const swingBr = {} as EstimativaLugar["swing"];
  for (const ano of ANOS) {
    const c = somaBc[ano];
    swingBr[`base${ano}` as "base2022" | "base2018"] =
      V > 0 && c.vv > 0
        ? { pt: (P / V - c.pt / c.vv) * 100, bolso: (B / V - c.bo / c.vv) * 100 }
        : { pt: null, bolso: null };
  }
  const somaHistUfs = (ano: AnoHist): HistResult | null => {
    let acc: HistResult | null = null;
    for (const s of estados) {
      const h = s.histUf?.[ano]?.[t] ?? somarHistMun(s.hist, ano, turno);
      if (!h) continue;
      acc = acc ?? { ap: 0, comp: 0, abst: 0, vv: 0, vb: 0, vn: 0, pt: 0, bo: 0 };
      acc.vv += h.vv;
      acc.pt += h.pt;
      acc.bo += h.bo;
      acc.ap += h.ap;
      acc.comp += h.comp;
      acc.abst += h.abst;
      acc.vb += h.vb;
      acc.vn += h.vn;
    }
    return acc;
  };
  const hBr22 = opts.histBr?.["2022"]?.[t] ?? somaHistUfs("2022");
  const hBr18 = opts.histBr?.["2018"]?.[t] ?? somaHistUfs("2018");

  const pctBr =
    opts.pctTotalizadoBr != null && isFinite(opts.pctTotalizadoBr)
      ? Math.max(0, Math.min(100, opts.pctTotalizadoBr))
      : somaPeso > 0
        ? somaPctPeso / somaPeso
        : 0;

  const br: EstimativaLugar = {
    uf: "br",
    pctTotalizado: pctBr,
    parcial: { pt: pctOuNull(P, V), bolso: pctOuNull(B, V), validos: V },
    cenarios: cenBr,
    swing: swingBr,
    fonteSwing: "proprio",
    validosRestantes: restantesBr,
    final2022: finalHist(hBr22),
    final2018: finalHist(hBr18),
  };

  // Intervalo nacional: mín/máx dos cenários ± margem histórica
  const ids = opts.cenariosIntervalo?.length ? opts.cenariosIntervalo : CENARIOS;
  const margemRaw = opts.margemHistorica ? opts.margemHistorica(pctBr) : null;
  let margem = margemRaw != null && isFinite(margemRaw) ? Math.max(0, margemRaw) : null;
  if (margem != null) {
    // Teto matemático: com R válidos restantes, o % final de um bloco só pode diferir da estimativa
    // por até 100·R/(V+R) p.p. Folga de 50% no volume restante estimado. No fim da apuração
    // (R → 0) a margem → 0 e o intervalo colapsa no resultado apurado (regra 9).
    let teto = 0;
    for (const c of ids) {
      const R = Math.max(0, cenBr[c].validos - V) * 1.5;
      const tot = V + R;
      if (tot > 0) teto = Math.max(teto, (100 * R) / tot);
    }
    margem = Math.min(margem, teto);
  }
  const m = margem ?? 0;
  const faixa = (k: "pt" | "bolso"): [number, number] => {
    const vals = ids.map((c) => Math.max(0, Math.min(100, fin(cenBr[c][k].pct))));
    return [Math.max(0, Math.min(...vals) - m), Math.min(100, Math.max(...vals) + m)];
  };

  return {
    br,
    ufs,
    intervalo: { pt: faixa("pt"), bolso: faixa("bolso") },
    margemHistorica: margem,
    disponivel: true,
  };
}
