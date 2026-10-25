// Tempo de apuração por UF e município, a partir do acompanhamento do TSE ({uf}-e{ele6}-ab.json).
//
// O TSE não publica o histórico da apuração. O acompanhamento traz, por município, o andamento
// ("and" = "f": concluído) e a data/hora da última totalização — num município concluído, o
// momento em que ele terminou de apurar. Com isso montamos a curva "eleitorado em municípios com
// a apuração concluída × minutos após o fechamento das urnas": no 1º turno (encerrado) é o retrato
// completo da noite; no 2º turno, a curva até agora. As duas usam a mesma medida e são comparáveis.
import { FECHAMENTO_URNAS, TURNOS_FINALIZADOS, UFS } from "../config";
import type { Ambiente, TemposLugar, TemposMunicipio, TemposResponse, Turno } from "../types";
import { fetchTse, mapLimit } from "./fetch";
import { dataHoraBrasilia, int } from "./parse";
import type { RawAcompanhamento } from "./raw";
import { urlAcompanhamento } from "./urls";

/** resolução da curva (minutos) */
export const PASSO_MIN = 5;
/** conclusões registradas mais de 12 h após o fechamento são retotalizações: ficam fora da curva */
const LIMITE_MIN = 12 * 60;
/** turno encerrado: o acompanhamento não muda mais → cache em memória longo */
const TTL_FINAL_MS = 30 * 60_000;

interface MunTempo {
  cd: string;
  te: number;
  ts: number;
  st: number;
  concluido: boolean;
  /** minuto da conclusão (null = não concluído ou sem horário utilizável) */
  m: number | null;
}

function lerUF(j: RawAcompanhamento | null, fechMs: number): MunTempo[] {
  const out: MunTempo[] = [];
  for (const a of j?.abr ?? []) {
    const cd = a.cdabr ?? "";
    if (!/^\d{5}$/.test(cd)) continue;
    if (a.tpabr && a.tpabr.toLowerCase() !== "mun") continue;
    const ts = int(a.s?.ts);
    const st = int(a.s?.st);
    const concluido = (a.and ?? "").toLowerCase() === "f" || (ts > 0 && st >= ts);
    let m: number | null = null;
    if (concluido) {
      const iso = dataHoraBrasilia(a.dt, a.ht);
      const t = iso ? Date.parse(iso) : NaN;
      const min = (t - fechMs) / 60_000;
      if (isFinite(min) && min <= LIMITE_MIN) m = Math.max(0, min);
    }
    out.push({ cd, te: int(a.e?.te), ts, st, concluido, m });
  }
  return out;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function resumo(muns: MunTempo[], fimMin: number): TemposLugar {
  let te = 0;
  let ts = 0;
  let st = 0;
  let concluidos = 0;
  let tardios = 0;
  const ev: [number, number][] = [];
  for (const x of muns) {
    te += x.te;
    ts += x.ts;
    st += x.st;
    if (!x.concluido) continue;
    concluidos++;
    if (x.m == null) tardios++;
    else ev.push([x.m, x.te]);
  }
  ev.sort((a, b) => a[0] - b[0]);

  const n = Math.max(1, Math.floor(fimMin / PASSO_MIN) + 1);
  const curva = new Array<number>(n).fill(0);
  let acc = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i * PASSO_MIN;
    while (k < ev.length && ev[k][0] <= t) acc += ev[k++][1];
    curva[i] = te > 0 ? r1((acc / te) * 100) : 0;
  }

  let m50: number | null = null;
  let m90: number | null = null;
  acc = 0;
  for (const [m, w] of ev) {
    acc += w;
    const p = te > 0 ? (acc / te) * 100 : 0;
    if (m50 == null && p >= 50) m50 = r1(m);
    if (m90 == null && p >= 90) m90 = r1(m);
  }
  // 100%: todos os municípios concluídos → horário da última conclusão conhecida
  const m100 = muns.length > 0 && concluidos === muns.length && ev.length ? r1(ev[ev.length - 1][0]) : null;

  return {
    pa: ts > 0 ? r1((st / ts) * 100) : 0,
    munTotal: muns.length,
    munConcluidos: concluidos,
    eleitorado: te,
    curva,
    m50,
    m90,
    m100,
    tardios,
  };
}

/**
 * Ritmo da apuração no Brasil e em cada UF (sem o exterior); com `uf`, também o minuto de conclusão
 * de cada município dessa UF. Lança (→ 502) se a maioria das UFs falhar por erro.
 */
export async function getTempos(p: { turno: Turno; ambiente: Ambiente; uf?: string | null }): Promise<TemposResponse> {
  const fechamento = FECHAMENTO_URNAS[p.turno];
  const fechMs = Date.parse(fechamento);
  const agoraMin = (Date.now() - fechMs) / 60_000;
  const encerrado = TURNOS_FINALIZADOS.includes(p.turno);
  const siglas = UFS.map((u) => u.sigla).filter((s) => s !== "zz");

  const porUf: Record<string, MunTempo[] | null> = {};
  let erros = 0;
  let primeiroErro: unknown = null;
  await mapLimit(siglas, 6, async (uf) => {
    try {
      const j = await fetchTse<RawAcompanhamento>(urlAcompanhamento(p.ambiente, p.turno, uf), {
        ttlMs: encerrado ? TTL_FINAL_MS : undefined,
      });
      porUf[uf] = j ? lerUF(j, fechMs) : null;
    } catch (e) {
      porUf[uf] = null;
      erros++;
      primeiroErro ??= e;
    }
  });
  if (erros * 2 > siglas.length && primeiroErro) throw primeiroErro;

  // eixo comum a todas as curvas: até a última conclusão e, com o turno em andamento, até agora
  let ultima = 0;
  for (const l of Object.values(porUf)) for (const x of l ?? []) if (x.m != null && x.m > ultima) ultima = x.m;
  const fimMin = Math.min(LIMITE_MIN, Math.max(ultima, encerrado ? 0 : Math.max(0, agoraMin)));

  const ufs: Record<string, TemposLugar | null> = {};
  const todos: MunTempo[] = [];
  for (const uf of siglas) {
    const l = porUf[uf];
    ufs[uf] = l ? resumo(l, fimMin) : null;
    if (l) todos.push(...l);
  }

  let municipios: Record<string, TemposMunicipio> | undefined;
  const ufSel = p.uf?.toLowerCase();
  if (ufSel && porUf[ufSel]) {
    municipios = {};
    for (const x of porUf[ufSel]!) {
      municipios[x.cd] = { m: x.m == null ? null : r1(x.m), te: x.te, pa: x.ts > 0 ? r1((x.st / x.ts) * 100) : 0 };
    }
  }

  return {
    turno: p.turno,
    geradoEm: new Date().toISOString(),
    fechamento,
    passoMin: PASSO_MIN,
    agoraMin: r1(agoraMin),
    br: resumo(todos, fimMin),
    ufs,
    municipios,
  };
}
