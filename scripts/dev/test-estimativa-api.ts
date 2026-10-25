// Teste da API de estimativa (servidor + rota).
//   NODE_OPTIONS=--dns-result-order=ipv4first TSE_MAX_RPS=30 npx tsx scripts/dev/test-estimativa-api.ts
//   ... --sem-oficial | --sem-simulado | --sem-rota  (pula etapas)
//
//  - oficial (antes das 17h): espera disponivel=false rápido, br null, 200 na rota;
//  - simulado (100% totalizado, dados fictícios): cada UF estimada == apurado; Brasil == soma das UFs;
//  - simulado "cortado" em 40% (totais × 0,4): com progresso uniforme a estimativa deve reproduzir o
//    resultado 100% (válidos e %), nos 3 cenários; com o progresso real do TSE (tudo 1) o restante = 0;
//  - rota GET /api/estimativa: 200 + Cache-Control, 400 em parâmetros inválidos.
import { getEstados } from "../../src/lib/tse/service";
import { estimativaDeEstados, getEstimativa } from "../../src/lib/estimativa/servidor";
import type { CenarioId, EstadosResponse, EstimativaLugar, EstimativaResponse, LiveResult } from "../../src/lib/types";

const args = new Set(process.argv.slice(2));
let falhas = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    falhas++;
    console.log(`  FALHA ${msg}`);
  }
}
const pct = (v: number | null | undefined) => (v == null ? "  -  " : v.toFixed(2).padStart(6));
const CENARIOS: CenarioId[] = ["base2022", "base2018", "proporcional"];

function resumoLugar(l: EstimativaLugar): string {
  const c = l.cenarios.base2022;
  return (
    `${l.uf.padEnd(3)} apur ${pct(l.pctTotalizado)}% | parcial PT ${pct(l.parcial.pt)} BO ${pct(l.parcial.bolso)} | ` +
    `est22 PT ${pct(c.pt.pct)} BO ${pct(c.bolso.pct)} | est18 PT ${pct(l.cenarios.base2018.pt.pct)} | ` +
    `prop PT ${pct(l.cenarios.proporcional.pt.pct)} | swing22 PT ${pct(l.swing.base2022.pt)} | fonte ${l.fonteSwing} | ` +
    `rest ${l.validosRestantes} | fin22 PT ${pct(l.final2022.pt)} fin18 PT ${pct(l.final2018.pt)}`
  );
}

function verificarFormato(r: EstimativaResponse) {
  ok(r.turno === 1 || r.turno === 2, "turno presente");
  ok(typeof r.geradoEm === "string" && !isNaN(Date.parse(r.geradoEm)), "geradoEm ISO");
  ok(r.atualizadoEm === null || !isNaN(Date.parse(r.atualizadoEm)), `atualizadoEm ISO/null (${r.atualizadoEm})`);
  ok(typeof r.disponivel === "boolean", "disponivel boolean");
  ok(typeof r.ufs === "object" && r.ufs !== null, "ufs objeto");
}

async function testeOficial() {
  console.log("\n== oficial, 1º turno ==");
  const t0 = Date.now();
  const r = await getEstimativa({ turno: 1, ambiente: "oficial" });
  const ms = Date.now() - t0;
  console.log(`  ${ms} ms; disponivel=${r.disponivel}; motivo=${r.motivo ?? "-"}; ufs=${Object.keys(r.ufs).length}`);
  verificarFormato(r);
  if (!r.disponivel) {
    ok(r.br === null, "br null quando indisponível");
    ok(r.intervalo === null, "intervalo null quando indisponível");
    ok(!!r.motivo, "motivo presente");
    ok(ms < 10_000, `rápido (< 10 s): ${ms} ms`);
    const t1 = Date.now();
    await getEstimativa({ turno: 1, ambiente: "oficial" });
    ok(Date.now() - t1 < 50, `memo/cache na 2ª chamada (${Date.now() - t1} ms)`);
  } else {
    console.log("  (apuração já começou — conferindo estrutura)");
    ok(!!r.br, "br presente");
    if (r.br) console.log("  " + resumoLugar(r.br));
    console.log(`  intervalo ${JSON.stringify(r.intervalo)} margem ${r.margemHistorica}`);
  }
}

async function testeSimulado() {
  console.log("\n== simulado, 1º turno (100% totalizado) ==");
  const t0 = Date.now();
  const r = await getEstimativa({ turno: 1, ambiente: "simulado" });
  const ms = Date.now() - t0;
  console.log(`  ${ms} ms; disponivel=${r.disponivel}; motivo=${r.motivo ?? "-"}; ufs=${Object.keys(r.ufs).length}`);
  verificarFormato(r);
  ok(r.disponivel, "disponivel=true no simulado");
  ok(!!r.br, "br presente");
  ok(Object.keys(r.ufs).length === 28, `28 lugares (27 UFs + zz): ${Object.keys(r.ufs).length}`);
  console.log(`  intervalo ${JSON.stringify(r.intervalo)}; margemHistorica ${r.margemHistorica}; atualizadoEm ${r.atualizadoEm}`);

  const estados = await getEstados({ turno: 1, ambiente: "simulado" });
  let difUF = 0;
  let somaPt = 0;
  let somaBo = 0;
  let somaVv = 0;
  for (const [uf, live] of Object.entries(estados.ufs)) {
    const e = r.ufs[uf];
    if (!live || !e) {
      console.log(`  ${uf}: live=${!!live} est=${!!e}`);
      continue;
    }
    const completo = live.totais.secoesTotal > 0 && live.totais.secoesTotalizadas >= live.totais.secoesTotal;
    const lpt = live.blocos.pt?.votos ?? 0;
    const lbo = live.blocos.bolso?.votos ?? 0;
    for (const c of CENARIOS) {
      const ec = e.cenarios[c];
      somaPt += c === "base2022" ? ec.pt.votos : 0;
      somaBo += c === "base2022" ? ec.bolso.votos : 0;
      somaVv += c === "base2022" ? ec.validos : 0;
      if (!completo) continue;
      const iguais =
        Math.round(ec.pt.votos) === lpt && Math.round(ec.bolso.votos) === lbo && Math.round(ec.validos) === live.totais.validos;
      const somaOk = Math.abs(ec.pt.votos + ec.bolso.votos + ec.outros.votos - ec.validos) < 1;
      if (!iguais || !somaOk) {
        difUF++;
        console.log(
          `  ${uf}/${c}: est pt=${ec.pt.votos} bo=${ec.bolso.votos} vv=${ec.validos} outros=${ec.outros.votos} × live pt=${lpt} bo=${lbo} vv=${live.totais.validos}`,
        );
      }
    }
    if (completo && Math.round(e.validosRestantes) !== 0) {
      difUF++;
      console.log(`  ${uf}: validosRestantes=${e.validosRestantes} (esperado 0)`);
    }
  }
  ok(difUF === 0, `cada UF 100% apurada: estimativa == apurado nos 3 cenários (${difUF} divergência(s))`);
  if (r.br) {
    const b = r.br.cenarios.base2022;
    ok(Math.abs(b.pt.votos - somaPt) < 1 && Math.abs(b.bolso.votos - somaBo) < 1 && Math.abs(b.validos - somaVv) < 1,
      `Brasil == soma das UFs (pt ${b.pt.votos}/${somaPt}, bo ${b.bolso.votos}/${somaBo}, vv ${b.validos}/${somaVv})`);
    if (estados.br) {
      const lb = estados.br;
      ok(
        Math.round(b.validos) === lb.totais.validos && Math.round(b.pt.votos) === (lb.blocos.pt?.votos ?? 0),
        `Brasil == resultado nacional do TSE (vv ${b.validos}/${lb.totais.validos}, pt ${b.pt.votos}/${lb.blocos.pt?.votos})`,
      );
    }
    const s = b.pt.pct + b.bolso.pct + b.outros.pct;
    ok(Math.abs(s - 100) < 0.01, `% pt+bolso+outros = 100 (${s.toFixed(4)})`);
    console.log("  " + resumoLugar(r.br));
  }
  for (const uf of ["sp", "ba", "zz"]) if (r.ufs[uf]) console.log("  " + resumoLugar(r.ufs[uf]));

  const t1 = Date.now();
  await getEstimativa({ turno: 1, ambiente: "simulado" });
  console.log(`  2ª chamada (memo): ${Date.now() - t1} ms`);
}

/** Copia o EstadosResponse com cada lugar "cortado" na fração f das seções (votos na mesma proporção). */
function cortar(estados: EstadosResponse, f: number): EstadosResponse {
  const c = structuredClone(estados);
  const corta = (r: LiveResult | null) => {
    if (!r) return;
    const t = r.totais;
    const st = Math.max(1, Math.round(t.secoesTotal * f));
    const k = st / t.secoesTotal;
    t.secoesTotalizadas = st;
    t.pctTotalizado = k * 100;
    t.validos = Math.round(t.validos * k);
    t.comparecimento = Math.round(t.comparecimento * k);
    for (const b of Object.values(r.blocos)) if (b) b.votos = Math.round(b.votos * k);
  };
  corta(c.br);
  Object.values(c.ufs).forEach(corta);
  return c;
}

async function testeParcial() {
  console.log("\n== simulado cortado em 40% (apuração parcial sintética) ==");
  const completo = await getEstimativa({ turno: 1, ambiente: "simulado" });
  const estados = await getEstados({ turno: 1, ambiente: "simulado" });
  const parcial = cortar(estados, 0.4);

  // (a) progresso indisponível → servidor usa progresso UNIFORME → deve reproduzir o 100%
  const warn = console.warn;
  let avisos = 0;
  console.warn = () => void avisos++;
  const t0 = Date.now();
  const r = await estimativaDeEstados(parcial, { progresso: async () => null });
  console.warn = warn;
  console.log(`  (a) uniforme: ${Date.now() - t0} ms; ${avisos} aviso(s) de fallback; disponivel=${r.disponivel}`);
  ok(r.disponivel && !!r.br, "disponivel com 40% apurado");
  ok(avisos === 28, `fallback uniforme acionado nas 28 UFs (${avisos})`);
  let piorPct = 0;
  let piorVv = 0;
  for (const [uf, e] of Object.entries(r.ufs)) {
    const ref = completo.ufs[uf];
    if (!ref) continue;
    for (const c of CENARIOS) {
      const a = e.cenarios[c];
      const b = ref.cenarios.base2022;
      piorPct = Math.max(piorPct, Math.abs(a.pt.pct - b.pt.pct), Math.abs(a.bolso.pct - b.bolso.pct));
      piorVv = Math.max(piorVv, Math.abs(a.validos / b.validos - 1));
    }
  }
  ok(piorPct < 0.01, `UFs: % estimado == % final (pior desvio ${piorPct.toFixed(5)} p.p.)`);
  ok(piorVv < 1e-3, `UFs: válidos estimados == válidos finais (pior desvio relativo ${piorVv.toExponential(2)})`);
  if (r.br && completo.br) {
    const a = r.br.cenarios.base2022;
    const b = completo.br.cenarios.base2022;
    ok(Math.abs(a.pt.pct - b.pt.pct) < 0.01 && Math.abs(a.bolso.pct - b.bolso.pct) < 0.01,
      `Brasil: PT ${a.pt.pct.toFixed(3)} vs ${b.pt.pct.toFixed(3)}, BO ${a.bolso.pct.toFixed(3)} vs ${b.bolso.pct.toFixed(3)}`);
    ok(Math.abs(r.br.pctTotalizado - 40) < 0.5, `Brasil pctTotalizado ≈ 40 (${r.br.pctTotalizado.toFixed(2)})`);
    ok(r.br.validosRestantes > 0, `validosRestantes > 0 (${r.br.validosRestantes})`);
    console.log("  " + resumoLugar(r.br));
    console.log(`  intervalo ${JSON.stringify(r.intervalo)}; margemHistorica ${r.margemHistorica}`);
  }

  // (b) progresso REAL do acompanhamento do simulado (todos os municípios = 1, i.e. 100%) com o
  //     resultado cortado em 40%: o servidor CONCILIA o acompanhamento com as seções do resultado
  //     (conciliarProgresso: β = 0,4 em todos) → equivale ao uniforme → deve reproduzir o 100%.
  const t1 = Date.now();
  const avisos2: string[] = [];
  console.warn = (...a: unknown[]) => void avisos2.push(a.join(" "));
  const r2 = await estimativaDeEstados(parcial);
  console.warn = warn;
  console.log(`  (b) acompanhamento real (28 downloads): ${Date.now() - t1} ms; ${avisos2.length} aviso(s) de defasagem`);
  ok(avisos2.filter((a) => a.includes("conciliado")).length === 28, `defasagem acompanhamento × resultado detectada nas 28 UFs (${avisos2.length})`);
  const restantes = Object.values(r2.ufs).reduce((s, e) => s + e.validosRestantes, 0);
  ok(restantes > 0, `acompanhamento conciliado com o resultado (restante > 0): ${Math.round(restantes)}`);
  if (r2.br && completo.br) {
    const a = r2.br.cenarios.base2022;
    const b = completo.br.cenarios.base2022;
    ok(
      Math.abs(a.pt.pct - b.pt.pct) < 0.01 && Math.abs(a.validos / b.validos - 1) < 1e-3,
      `conciliado reproduz o 100%: PT ${a.pt.pct.toFixed(3)} vs ${b.pt.pct.toFixed(3)}, vv ${Math.round(a.validos)} vs ${b.validos}`,
    );
  }
}

async function testeRota() {
  console.log("\n== rota GET /api/estimativa ==");
  const { NextRequest } = await import("next/server");
  const rota = await import("../../src/app/api/estimativa/route");
  ok(rota.runtime === "nodejs" && rota.dynamic === "force-dynamic" && rota.maxDuration === 60, "segment config (nodejs, force-dynamic, 60)");
  const casos: [string, number][] = [
    ["turno=1", 200],
    ["turno=1&amb=simulado", 200],
    ["turno=3", 400],
    ["turno=1&amb=xyz", 400],
  ];
  for (const [q, esperado] of casos) {
    const t0 = Date.now();
    const res = await rota.GET(new NextRequest(`http://localhost/api/estimativa?${q}`));
    const corpo = (await res.json()) as EstimativaResponse & { erro?: string };
    const cc = res.headers.get("cache-control");
    console.log(`  ?${q} → ${res.status} (${Date.now() - t0} ms) cache="${cc}" ${corpo.erro ? `erro="${corpo.erro}"` : `disponivel=${corpo.disponivel}`}`);
    ok(res.status === esperado, `?${q} status ${esperado}`);
    if (res.status === 200) ok(cc?.startsWith("public, s-maxage="), "Cache-Control público");
    else ok(cc === "no-store", "erro com no-store");
  }
}

(async () => {
  const t0 = Date.now();
  if (!args.has("--sem-oficial")) await testeOficial();
  if (!args.has("--sem-simulado")) {
    await testeSimulado();
    await testeParcial();
  }
  if (!args.has("--sem-rota")) await testeRota();
  console.log(`\n${falhas ? `${falhas} FALHA(S)` : "tudo ok"} — ${Date.now() - t0} ms`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
