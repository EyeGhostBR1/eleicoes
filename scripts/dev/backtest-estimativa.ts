// Backtest histórico do modelo de estimativa (src/lib/estimativa/modelo.ts).
//
//   npx tsx scripts/dev/backtest-estimativa.ts [--seeds 6] [--out <arquivo.md>]
//   (rodar a partir da raiz do projeto)
//
// Ideia: tratar 2022 como a eleição "ao vivo" e 2018 como ano-base (1º e 2º turnos em separado),
// simular apurações parciais com ordens de chegada realistas e rodar estimar() em 1%, 3%, …, 99%
// das seções do país. Compara com o resultado FINAL verdadeiro de 2022.
// Também roda o caminho inverso (2018 "ao vivo" com base 2022) como verificação de sanidade.
//
// Hipóteses da simulação (importante):
//  - "Seções" ≈ eleitorado apto (ap) do município: % apurado nacional = Σ f_m·ap_m / Σ ap_m.
//  - Votos apurados de um município parcialmente apurado = f_m × votos finais do município
//    (as seções já apuradas se comportam como a média do município). A ordem "vies" relaxa isso
//    com um viés intramunicipal aleatório (ex.: centro × periferia), mantendo o total final.
//  - Municípios sem histórico no ano-base entram no apurado (P, V) mas não na base (como em 2026).
//  - No backtest, o cenário principal do modelo é base{anoBase} (anoPrincipal = anoBase), pois o
//    cenário base{anoAoVivo} usaria o próprio resultado final (seria trapaça).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UF_POR_SIGLA } from "../../src/lib/config";
import { estimar, type EntradaUF } from "../../src/lib/estimativa/modelo";
import type { AnoHist, HistBrFile, HistMunFile, Turno } from "../../src/lib/types";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(nome: string, def: string): string {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const SEEDS = Number(arg("--seeds", "6"));
const OUT = arg(
  "--out",
  "C:\\Users\\gabri\\AppData\\Local\\Temp\\claude\\C--Users-gabri-Desktop-Elei--es\\6ddf5b23-fbbb-4ab5-a74a-c4a85bab5c69\\scratchpad\\backtest-estimativa.md",
);

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const DIR_HIST = join(ROOT, "public", "data", "hist");
const histBr = JSON.parse(readFileSync(join(DIR_HIST, "br.json"), "utf8")) as HistBrFile;
const histMun: Record<string, HistMunFile> = {};
for (const f of readdirSync(join(DIR_HIST, "mun"))) {
  if (!f.endsWith(".json")) continue;
  histMun[f.replace(".json", "")] = JSON.parse(readFileSync(join(DIR_HIST, "mun", f), "utf8")) as HistMunFile;
}
const UFS_SIM = Object.keys(histMun).sort();

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const unif = (r: Rng, a: number, b: number) => a + (b - a) * r();
function normal(r: Rng, sd: number): number {
  const u = Math.max(1e-12, r());
  const v = r();
  return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Municípios "ao vivo"
// ---------------------------------------------------------------------------
interface Mun {
  cd: string;
  uf: string;
  regiao: string;
  ap: number;
  vv: number;
  pt: number;
  bo: number;
  /** quantil de tamanho (0 = menor, 1 = maior) */
  q: number;
  /** log10(ap/1000) ≥ 0 */
  L: number;
}

function carregarMuns(anoVivo: AnoHist, turno: Turno): Mun[] {
  const t = String(turno) as "1" | "2";
  const out: Mun[] = [];
  for (const uf of UFS_SIM) {
    const regiao = UF_POR_SIGLA[uf]?.regiao ?? "?";
    for (const [cd, h] of Object.entries(histMun[uf])) {
      const r = h[anoVivo]?.[t];
      if (!r) continue;
      out.push({ cd, uf, regiao, ap: r.ap, vv: r.vv, pt: r.pt, bo: r.bo, q: 0, L: Math.log10(Math.max(r.ap, 1000) / 1000) });
    }
  }
  const ord = out.map((m, i) => [m.ap, i] as const).sort((a, b) => a[0] - b[0]);
  ord.forEach(([, i], k) => (out[i].q = k / (ord.length - 1)));
  return out;
}

// ---------------------------------------------------------------------------
// Ordens de apuração (agenda: início s_m e duração d_m; f_m(t) = clamp((t − s_m)/d_m))
// ---------------------------------------------------------------------------
const ORDENS = ["regiao", "pequenos", "grandes", "aleatoria", "gradual", "vies", "nordeste"] as const;
type Ordem = (typeof ORDENS)[number];
const ORDENS_MARGEM: Ordem[] = ["regiao", "pequenos", "grandes", "aleatoria", "gradual"];
const NOME_ORDEM: Record<Ordem, string> = {
  regiao: "(a) por região (S/SE/CO rápidos, N/NE lentos, exterior por último)",
  pequenos: "(b) municípios pequenos primeiro",
  grandes: "(c) capitais/grandes cidades primeiro",
  aleatoria: "(d) aleatória uniforme",
  gradual: "(e) progresso intramunicipal gradual (todos parciais)",
  vies: "(f) ESTRESSE: (a) + viés intramunicipal nas seções apuradas",
  nordeste: "(g) por região INVERTIDA (N/NE rápidos, S/SE/CO lentos, exterior por último) — fora das margens",
};

interface Agenda {
  s: Float64Array;
  d: Float64Array;
  /** viés intramunicipal na fatia PT do apurado (Bolsonaro recebe −δ) */
  delta: Float64Array | null;
}

/** Ordem (g): Norte/Nordeste apuram primeiro (cenário do 2º turno de 2026, votação até 19h). */
const REG_BASE_INV: Record<string, number> = {
  Norte: 0,
  Nordeste: 0.02,
  "Centro-Oeste": 0.12,
  Sudeste: 0.15,
  Sul: 0.2,
  Exterior: 0.5,
};

const REG_BASE: Record<string, number> = {
  Sul: 0,
  "Centro-Oeste": 0.03,
  Sudeste: 0.04,
  Nordeste: 0.14,
  Norte: 0.2,
  Exterior: 0.5,
};

function agenda(ordem: Ordem, muns: Mun[], rng: Rng): Agenda {
  const n = muns.length;
  const s = new Float64Array(n);
  const d = new Float64Array(n);
  let delta: Float64Array | null = null;
  const ufOff: Record<string, number> = {};
  const ufFat: Record<string, number> = {};
  for (const uf of UFS_SIM) {
    ufOff[uf] = normal(rng, 0.03);
    ufFat[uf] = unif(rng, 0.6, 1.4);
  }
  const regFat = unif(rng, 0.6, 1.4);
  for (let i = 0; i < n; i++) {
    const m = muns[i];
    switch (ordem) {
      case "regiao":
      case "vies":
      case "nordeste": {
        const rb = ordem === "nordeste" ? REG_BASE_INV : REG_BASE;
        if (m.uf === "zz") {
          s[i] = rb.Exterior * regFat + unif(rng, 0, 0.4);
          d[i] = unif(rng, 0.02, 0.08);
        } else {
          s[i] = Math.max(0, (rb[m.regiao] ?? 0.1) * regFat + ufOff[m.uf] + unif(rng, 0, 0.2));
          d[i] = (0.04 + 0.1 * m.L) * unif(rng, 0.7, 1.3);
        }
        break;
      }
      case "pequenos":
        s[i] = 0.7 * m.q + unif(rng, 0, 0.15);
        d[i] = (0.03 + 0.06 * m.L) * unif(rng, 0.7, 1.3);
        break;
      case "grandes":
        s[i] = 0.7 * (1 - m.q) + unif(rng, 0, 0.15);
        d[i] = (0.03 + 0.06 * m.L) * unif(rng, 0.7, 1.3);
        break;
      case "aleatoria":
        s[i] = rng();
        d[i] = 0.02 + unif(rng, 0, 0.05);
        break;
      case "gradual":
        s[i] = unif(rng, 0, 0.05);
        d[i] = unif(rng, 0.5, 1.5) * ufFat[m.uf];
        break;
    }
  }
  if (ordem === "vies") {
    delta = new Float64Array(n);
    const ufComum: Record<string, number> = {};
    for (const uf of UFS_SIM) ufComum[uf] = normal(rng, 0.015);
    for (let i = 0; i < n; i++) delta[i] = normal(rng, 0.03) + ufComum[muns[i].uf];
  }
  return { s, d, delta };
}

function fracao(s: number, d: number, t: number): number {
  if (t <= s) return 0;
  if (d <= 0) return 1;
  const x = (t - s) / d;
  return x >= 1 ? 1 : x;
}

function pctNacional(ag: Agenda, muns: Mun[], apTot: number, t: number): number {
  let acc = 0;
  for (let i = 0; i < muns.length; i++) acc += fracao(ag.s[i], ag.d[i], t) * muns[i].ap;
  return (acc / apTot) * 100;
}

function tempoPara(alvo: number, ag: Agenda, muns: Mun[], apTot: number): number {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < muns.length; i++) hi = Math.max(hi, ag.s[i] + ag.d[i]);
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (pctNacional(ag, muns, apTot, mid) < alvo) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
interface Registro {
  dir: string; // "2022←2018" (ao vivo ← base)
  turno: Turno;
  ordem: Ordem;
  seed: number;
  nivel: number;
  pctReal: number;
  faixa: number;
  verdade: { pt: number; bo: number };
  ingenuo: { pt: number; bo: number };
  prop: { pt: number; bo: number };
  modelo: { pt: number; bo: number };
}

const NIVEIS: number[] = [];
for (let p = 1; p < 100; p += 2) NIVEIS.push(p);

function rodar(anoVivo: AnoHist, anoBase: AnoHist, turno: Turno): Registro[] {
  const muns = carregarMuns(anoVivo, turno);
  const apTot = muns.reduce((a, m) => a + m.ap, 0);
  const vvTot = muns.reduce((a, m) => a + m.vv, 0);
  const verdade = {
    pt: (muns.reduce((a, m) => a + m.pt, 0) / vvTot) * 100,
    bo: (muns.reduce((a, m) => a + m.bo, 0) / vvTot) * 100,
  };
  // conferência com br.json
  const hb = histBr.br[anoVivo]?.[String(turno) as "1" | "2"];
  if (hb && Math.abs(hb.vv - vvTot) > 0) console.warn(`aviso: Σ municípios (${vvTot}) ≠ br.json (${hb.vv})`);

  const porUf = new Map<string, number[]>();
  muns.forEach((m, i) => {
    const l = porUf.get(m.uf) ?? [];
    l.push(i);
    porUf.set(m.uf, l);
  });
  const dir = `${anoVivo}←${anoBase}`;
  const out: Registro[] = [];

  for (const ordem of ORDENS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rng = mulberry32(seed * 7919 + ORDENS.indexOf(ordem) * 104729 + turno * 31 + Number(anoVivo));
      const ag = agenda(ordem, muns, rng);
      for (const nivel of NIVEIS) {
        const t = tempoPara(nivel, ag, muns, apTot);
        const entradas: EntradaUF[] = [];
        let apC = 0;
        for (const uf of UFS_SIM) {
          const idx = porUf.get(uf) ?? [];
          const progresso: Record<string, number> = {};
          let vv = 0;
          let pt = 0;
          let bo = 0;
          let apU = 0;
          let apUc = 0;
          for (const i of idx) {
            const m = muns[i];
            const f = fracao(ag.s[i], ag.d[i], t);
            apU += m.ap;
            if (f <= 0) continue;
            progresso[m.cd] = f;
            apUc += f * m.ap;
            const vvc = f * m.vv;
            vv += vvc;
            if (ag.delta && m.vv > 0) {
              const dl = ag.delta[i] * (1 - f);
              const sp = Math.min(1, Math.max(0, m.pt / m.vv + dl));
              const sb = Math.min(1 - sp, Math.max(0, m.bo / m.vv - dl));
              pt += vvc * sp;
              bo += vvc * sb;
            } else {
              pt += f * m.pt;
              bo += f * m.bo;
            }
          }
          apC += apUc;
          entradas.push({
            uf,
            live: vv > 0 ? { vv, pt, bo, pctTotalizado: apU > 0 ? (apUc / apU) * 100 : 0 } : null,
            progresso,
            hist: histMun[uf],
            histUf: histBr.ufs[uf],
          });
        }
        const pctReal = (apC / apTot) * 100;
        const r = estimar(entradas, turno, { histBr: histBr.br, anoPrincipal: anoBase, pctTotalizadoBr: pctReal });
        if (!r.br) continue;
        const base = r.br.cenarios[`base${anoBase}` as "base2022" | "base2018"];
        out.push({
          dir,
          turno,
          ordem,
          seed,
          nivel,
          pctReal,
          faixa: Math.min(9, Math.floor(pctReal / 10)),
          verdade,
          ingenuo: { pt: r.br.parcial.pt ?? NaN, bo: r.br.parcial.bolso ?? NaN },
          prop: { pt: r.br.cenarios.proporcional.pt.pct, bo: r.br.cenarios.proporcional.bolso.pct },
          modelo: { pt: base.pt.pct, bo: base.bolso.pct },
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Estatísticas
// ---------------------------------------------------------------------------
function quantil(xs: number[], q: number): number {
  const a = xs.filter((x) => isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const pos = (a.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const f2 = (x: number) => (isFinite(x) ? x.toFixed(2) : "—");
const f1 = (x: number) => (isFinite(x) ? x.toFixed(1) : "—");
type Metodo = "ingenuo" | "prop" | "modelo";
const err = (r: Registro, m: Metodo, b: "pt" | "bo") => r[m][b] - r.verdade[b];
const FAIXAS = Array.from({ length: 10 }, (_, i) => i);
const rotFaixa = (i: number) => `${i * 10}–${i * 10 + 10}%`;

function tabelaErros(rs: Registro[]): string {
  const linhas = [
    "| % apurado | n | Ingênuo Lula p95 | Ingênuo Bolso p95 | Proporcional Lula p95 | Proporcional Bolso p95 | **Modelo Lula p95** | **Modelo Bolso p95** | Modelo média abs | Modelo máx abs |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const fx of FAIXAS) {
    const g = rs.filter((r) => r.faixa === fx);
    if (!g.length) continue;
    const abs = (m: Metodo, b: "pt" | "bo") => g.map((r) => Math.abs(err(r, m, b)));
    const both = [...abs("modelo", "pt"), ...abs("modelo", "bo")];
    linhas.push(
      `| ${rotFaixa(fx)} | ${g.length} | ${f2(quantil(abs("ingenuo", "pt"), 0.95))} | ${f2(quantil(abs("ingenuo", "bo"), 0.95))} | ${f2(
        quantil(abs("prop", "pt"), 0.95),
      )} | ${f2(quantil(abs("prop", "bo"), 0.95))} | **${f2(quantil(abs("modelo", "pt"), 0.95))}** | **${f2(
        quantil(abs("modelo", "bo"), 0.95),
      )}** | ${f2(media(both))} | ${f2(Math.max(...both))} |`,
    );
  }
  return linhas.join("\n");
}

function tabelaPorOrdem(rs: Registro[], faixas: number[]): string {
  const cab = faixas.map((f) => rotFaixa(f)).join(" | ");
  const linhas = [
    `| Ordem | Método | ${cab} |`,
    `|---|---|${faixas.map(() => "---").join("|")}|`,
  ];
  for (const o of ORDENS) {
    for (const m of ["ingenuo", "modelo"] as Metodo[]) {
      const cels = faixas.map((fx) => {
        const g = rs.filter((r) => r.ordem === o && r.faixa === fx);
        if (!g.length) return "—";
        return `${f1(media(g.map((r) => err(r, m, "pt"))))} / ${f1(media(g.map((r) => err(r, m, "bo"))))}`;
      });
      linhas.push(`| ${o} | ${m === "modelo" ? "modelo" : "ingênuo"} | ${cels.join(" | ")} |`);
    }
  }
  return linhas.join("\n");
}

/** % de acerto das "chamadas" por faixa. */
function tabelaChamadas(rs: Registro[], turno: Turno): string {
  const verd = rs[0]?.verdade;
  if (!verd) return "";
  const chamadas: { nome: string; f: (x: { pt: number; bo: number }) => boolean }[] =
    turno === 1
      ? [
          { nome: "Bloco PT > 50%?", f: (x) => x.pt > 50 },
          { nome: "Bloco Bolsonaro > 50%?", f: (x) => x.bo > 50 },
          { nome: "Quem lidera", f: (x) => x.pt > x.bo },
        ]
      : [{ nome: "Vencedor", f: (x) => x.pt > x.bo }];
  const linhas = [
    `| % apurado | ${chamadas.map((c) => `${c.nome} — ingênuo / proporcional / modelo`).join(" | ")} |`,
    `|---|${chamadas.map(() => "---").join("|")}|`,
  ];
  for (const fx of FAIXAS) {
    const g = rs.filter((r) => r.faixa === fx);
    if (!g.length) continue;
    const cels = chamadas.map((c) => {
      const v = c.f(verd);
      const taxa = (m: Metodo) => (g.filter((r) => c.f(r[m]) === v).length / g.length) * 100;
      return `${taxa("ingenuo").toFixed(0)}% / ${taxa("prop").toFixed(0)}% / ${taxa("modelo").toFixed(0)}%`;
    });
    linhas.push(`| ${rotFaixa(fx)} | ${cels.join(" | ")} |`);
  }
  return linhas.join("\n");
}

/** Por faixa: maior entre o p95 do erro absoluto do modelo para PT e para Bolsonaro. */
function p95Faixas(rs: Registro[]): number[] {
  return FAIXAS.map((fx) => {
    const g = rs.filter((r) => r.faixa === fx);
    return Math.max(
      quantil(g.map((r) => Math.abs(err(r, "modelo", "pt"))), 0.95),
      quantil(g.map((r) => Math.abs(err(r, "modelo", "bo"))), 0.95),
    );
  });
}

/** Envelope monótono (não crescente com o % apurado), arredondado para cima a 0,1 p.p., piso 0,2. */
function suavizar(v: number[]): number[] {
  const out = v.map((x) => (isFinite(x) ? x : 0));
  for (let i = out.length - 2; i >= 0; i--) out[i] = Math.max(out[i], out[i + 1]);
  return out.map((x) => Math.max(0.2, Math.ceil(x * 10 - 1e-9) / 10));
}

function cobertura(rs: Registro[], margens: number[]): string {
  const linhas = ["| % apurado | margem (p.p.) | cobertura Lula | cobertura Bolso |", "|---|---|---|---|"];
  for (const fx of FAIXAS) {
    const g = rs.filter((r) => r.faixa === fx);
    if (!g.length) continue;
    const m = margens[fx];
    const cob = (b: "pt" | "bo") =>
      (g.filter((r) => {
        const lo = Math.min(r.modelo[b], r.prop[b]) - m;
        const hi = Math.max(r.modelo[b], r.prop[b]) + m;
        return r.verdade[b] >= lo && r.verdade[b] <= hi;
      }).length /
        g.length) *
      100;
    linhas.push(`| ${rotFaixa(fx)} | ${m.toFixed(1)} | ${cob("pt").toFixed(1)}% | ${cob("bo").toFixed(1)}% |`);
  }
  return linhas.join("\n");
}

/** Chamada "PT > 50%" só quando o intervalo exclui 50%: taxa de chamada e de erro, por direção/turno e faixa. */
function tabelaChamadaSegura(rs: Registro[], margens: number[]): string {
  const grupos: { nome: string; g: Registro[] }[] = [];
  for (const dir of ["2022←2018", "2018←2022"])
    for (const turno of [1, 2] as Turno[])
      grupos.push({ nome: `${dir} T${turno}`, g: rs.filter((r) => r.dir === dir && r.turno === turno) });
  const linhas = [
    `| % apurado | ${grupos.map((x) => `${x.nome}: chamou / errou`).join(" | ")} |`,
    `|---|${grupos.map(() => "---").join("|")}|`,
  ];
  for (const fx of FAIXAS) {
    const cels = grupos.map(({ g }) => {
      const h = g.filter((r) => r.faixa === fx);
      if (!h.length) return "—";
      const m = margens[fx];
      let chamou = 0;
      let errou = 0;
      for (const r of h) {
        const lo = Math.min(r.modelo.pt, r.prop.pt) - m;
        const hi = Math.max(r.modelo.pt, r.prop.pt) + m;
        if (lo > 50 || hi < 50) {
          chamou++;
          if (lo > 50 !== r.verdade.pt > 50) errou++;
        }
      }
      return `${((chamou / h.length) * 100).toFixed(0)}% / ${chamou ? ((errou / chamou) * 100).toFixed(1) : "0.0"}%`;
    });
    linhas.push(`| ${rotFaixa(fx)} | ${cels.join(" | ")} |`);
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const t0 = Date.now();
const todos: Registro[] = [];
for (const [vivo, base] of [
  ["2022", "2018"],
  ["2018", "2022"],
] as [AnoHist, AnoHist][]) {
  for (const turno of [1, 2] as Turno[]) {
    const rs = rodar(vivo, base, turno);
    todos.push(...rs);
    console.log(`${vivo}←${base} T${turno}: ${rs.length} estimativas (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
}

const md: string[] = [];
md.push("# Backtest do modelo de estimativa (swing por UF ajustado pela composição)");
md.push("");
md.push(`Gerado em ${new Date().toISOString()} por \`scripts/dev/backtest-estimativa.ts\` — ${SEEDS} sementes por ordem, níveis 1%, 3%, …, 99% das seções do país.`);
md.push("");
md.push("Erro = estimativa − resultado final verdadeiro, em p.p. dos votos válidos (nacional).");
md.push("- **Ingênuo** = % já apurado (o que o TSE mostra).");
md.push("- **Proporcional** = restante de cada UF vota como o já apurado da UF.");
md.push("- **Modelo** = cenário base-ano (swing por UF ajustado pela composição do apurado).");
md.push("");
md.push("Ordens de apuração simuladas:");
for (const o of ORDENS) md.push(`- \`${o}\`: ${NOME_ORDEM[o]}`);
md.push("");
md.push("Hipótese: as seções apuradas de um município se comportam como a média do município (exceto na ordem de estresse `vies`).");
md.push("");

const margensPorDir: Record<string, number[]> = {};
for (const dir of ["2022←2018", "2018←2022"]) {
  md.push(`## ${dir === "2022←2018" ? "Principal: 2022 \"ao vivo\" com base 2018" : "Sanidade (inverso): 2018 \"ao vivo\" com base 2022"}`);
  md.push("");
  const rsDir = todos.filter((r) => r.dir === dir && ORDENS_MARGEM.includes(r.ordem));
  margensPorDir[dir] = p95Faixas(rsDir);
  for (const turno of [1, 2] as Turno[]) {
    const rs = todos.filter((r) => r.dir === dir && r.turno === turno);
    const rsM = rs.filter((r) => ORDENS_MARGEM.includes(r.ordem));
    const v = rs[0].verdade;
    md.push(`### ${turno}º turno — final verdadeiro: PT ${v.pt.toFixed(2)}% · Bolsonaro ${v.bo.toFixed(2)}%`);
    md.push("");
    md.push("Erro absoluto p95 (p.p.), ordens (a)–(e):");
    md.push("");
    md.push(tabelaErros(rsM));
    md.push("");
    md.push("Erro médio com sinal por ordem (PT / Bolsonaro, p.p.):");
    md.push("");
    md.push(tabelaPorOrdem(rs, [0, 2, 4, 6, 8]));
    md.push("");
    md.push("Acerto das chamadas (ordens (a)–(e)):");
    md.push("");
    md.push(tabelaChamadas(rsM, turno));
    md.push("");
    md.push("Estresse (f) — viés intramunicipal: erro absoluto p95 (p.p.):");
    md.push("");
    md.push(tabelaErros(rs.filter((r) => r.ordem === "vies")));
    md.push("");
  }
}

// Margens: p95 do erro absoluto do modelo (máx entre PT e Bolsonaro; 1º e 2º turnos juntos; ordens
// a–e), direção principal e inversa; usa-se o MAIOR dos dois por faixa (conservador), envelope monótono.
const brutoMax = FAIXAS.map((i) => Math.max(margensPorDir["2022←2018"][i], margensPorDir["2018←2022"][i]));
const margens = suavizar(brutoMax);
md.push("## Margens históricas (src/lib/estimativa/margens.ts)");
md.push("");
md.push("| % apurado | p95 2022←2018 | p95 2018←2022 | margem escolhida |");
md.push("|---|---|---|---|");
for (const fx of FAIXAS)
  md.push(`| ${rotFaixa(fx)} | ${f2(margensPorDir["2022←2018"][fx])} | ${f2(margensPorDir["2018←2022"][fx])} | ${margens[fx].toFixed(1)} |`);
md.push("");
md.push("Cobertura do intervalo [mín(modelo, proporcional) − margem, máx + margem] (sem o cenário-trapaça):");
md.push("");
for (const dir of ["2022←2018", "2018←2022"]) {
  md.push(`**${dir}**, ordens (a)–(e):`);
  md.push("");
  md.push(cobertura(todos.filter((r) => r.dir === dir && ORDENS_MARGEM.includes(r.ordem)), margens));
  md.push("");
  md.push(`**${dir}**, estresse (f):`);
  md.push("");
  md.push(cobertura(todos.filter((r) => r.dir === dir && r.ordem === "vies"), margens));
  md.push("");
}

md.push("Chamada \"bloco PT > 50% dos válidos\" (1º turno: vence sem 2º turno; 2º turno: vence a eleição) só quando o intervalo");
md.push("[mín(modelo, proporcional) − margem, máx + margem] exclui 50% — % de simulações com chamada e % de chamadas erradas:");
md.push("");
md.push(tabelaChamadaSegura(todos.filter((r) => ORDENS_MARGEM.includes(r.ordem)), margens));
md.push("");

const ts = `export const MARGENS: { ate: number; pp: number }[] = [\n${FAIXAS.map(
  (fx) => `  { ate: ${fx * 10 + 10}, pp: ${margens[fx].toFixed(1)} },`,
).join("\n")}\n];`;
md.push("```ts");
md.push(ts);
md.push("```");

md.push("");
md.push("## Ordem (g): Norte/Nordeste primeiro × ordem (a): Sul/Sudeste primeiro");
md.push("");
for (const dir of ["2022←2018", "2018←2022"]) {
  for (const turno of [1, 2] as Turno[]) {
    for (const o of ["regiao", "nordeste"] as Ordem[]) {
      const rs = todos.filter((r) => r.dir === dir && r.turno === turno && r.ordem === o);
      if (!rs.length) continue;
      md.push(`### ${dir} · ${turno}º turno · ordem \`${o}\``);
      md.push("");
      md.push(tabelaErros(rs));
      md.push("");
      md.push(tabelaChamadas(rs, turno));
      md.push("");
    }
  }
}
writeFileSync(OUT, md.join("\n"), "utf8");
console.log("");
console.log(md.join("\n"));
console.log("");
console.log(`Relatório: ${OUT} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
