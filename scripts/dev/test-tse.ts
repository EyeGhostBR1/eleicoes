// Teste do módulo TSE ao vivo.
//   npx tsx scripts/dev/test-tse.ts            (fixtures + simulado + oficial + rotas)
//   npx tsx scripts/dev/test-tse.ts --offline  (só fixtures)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aplicarFallbackBlocos,
  CACHE_NAO_DIVULGADO,
  destinacaoValida,
  mapeamentoParaFallback,
  getEstados,
  getMunicipios,
  getResultado,
  isFinalizado,
  isNaoIniciado,
  normalizeUnificado,
  parseParamsTse,
  toMunRow,
  urlAcompanhamento,
  urlConfigMunicipios,
  urlResultado,
} from "../../src/lib/tse/index";
import type { RawUnificado } from "../../src/lib/tse/index";
import type { LiveResult } from "../../src/lib/types";

const ROOT = join(__dirname, "..", "..");
const FIX = join(ROOT, "test-fixtures", "tse");
const offline = process.argv.includes("--offline");

let falhas = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log(`  ✔ ${msg}`);
  else {
    falhas++;
    console.log(`  ✘ ${msg}`);
  }
}
const lerFix = (f: string) => JSON.parse(readFileSync(join(FIX, f), "utf8"));
const ms = (t0: number) => `${Date.now() - t0} ms`;

function resumo(r: LiveResult | null): string {
  if (!r) return "null";
  const t = r.totais;
  const b = (k: "pt" | "bolso") =>
    r.blocos[k] ? `${k}=${r.blocos[k]!.n} ${r.blocos[k]!.nome} ${r.blocos[k]!.pct.toFixed(2)}%` : `${k}=—`;
  return [
    `${r.escopo}:${r.uf}${r.mun ? "/" + r.mun : ""} t${r.turno} ${r.ambiente} ele=${r.eleicao}`,
    `apurado=${t.pctTotalizado.toFixed(2)}% (${t.secoesTotalizadas}/${t.secoesTotal})`,
    `vv=${t.validos} comp=${t.pctComparecimento.toFixed(2)}%`,
    `cands=${r.candidatos.length} 1º=${r.candidatos[0]?.n}`,
    b("pt"),
    b("bolso"),
    r.blocosPorFallback ? "(fallback)" : "",
    `fin=${r.finalizado} em=${r.atualizadoEm}`,
  ].join(" | ");
}

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n# URLs");
  console.log(" ", urlResultado("simulado", 1, "br"));
  console.log(" ", urlResultado("oficial", 1, "sp", "71072"));
  console.log(" ", urlAcompanhamento("oficial", 2, "mg"));
  console.log(" ", urlConfigMunicipios("oficial", 1));
  ok(
    urlResultado("simulado", 1, "SP", "71072") ===
      "https://resultados-sim.tse.jus.br/simulado/simulado2026/ele2026/21270/dados/sp/sp71072-c0001-e021270-u.json",
    "urlResultado (mun)",
  );
  ok(
    urlAcompanhamento("oficial", 1, "br") === "https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-e006257-ab.json",
    "urlAcompanhamento (br)",
  );

  // -------------------------------------------------------------------------
  console.log("\n# Normalização das fixtures");
  const brRaw: RawUnificado = lerFix("sim-br-u.json");
  const br = normalizeUnificado(brRaw, { escopo: "br", uf: "br", turno: 1, ambiente: "simulado", eleicao: "21270" });
  console.log(" ", resumo(br));
  ok(br.candidatos.length === 13, "13 candidatos achatados");
  ok(br.candidatos.every((c, i, a) => i === 0 || a[i - 1].votos >= c.votos), "ordenados por votos desc");
  ok(br.candidatos[0].n === "57" && br.candidatos[0].votos === 10503573, "1º = 57 (10.503.573)");
  // pct = votos / v.vv (mesma definição do hist e do LiveMunRow), NÃO o pvapn do TSE
  // (no simulado o pvapn usa como base todos os votos nominais, incl. candidatos anulados).
  ok(Math.abs(br.candidatos[0].pct - (10503573 / 100982116) * 100) < 1e-6, "pct = votos / vv (não pvapn)");
  const c68 = br.candidatos.find((c) => c.n === "68")!;
  ok(Math.abs(c68.pct - 9.042065) < 1e-5, `pct candidato válido 68 = 9,0421% (pvapn seria 7,57%) → ${c68.pct}`);
  ok(br.candidatos[0].situacao === "2º turno" && br.candidatos[0].eleito === false, "st '2º turno' → eleito=false");
  ok(br.candidatos[0].destinacao === "Anulado sub judice", "destinacao = dvt");
  ok(br.totais.secoesTotal === 528951 && br.totais.secoesTotalizadas === 528951 && br.totais.pctTotalizado === 100, "seções");
  ok(br.totais.eleitorado === 163079139 && br.totais.comparecimento === 138863131 && br.totais.abstencao === 24215741, "eleitorado");
  ok(Math.abs(br.totais.pctComparecimento - 85.1509) < 1e-3, "pctComparecimento = e.pcn");
  ok(br.totais.validos === 100982116 && br.totais.brancos === 9118018 && br.totais.nulos === 9040537, "votos válidos/brancos/nulos");
  ok(br.atualizadoEm === "2026-09-29T16:28:52-03:00", "atualizadoEm de dt/ht");
  ok(br.finalizado === true && isFinalizado(brRaw), "finalizado (and = f)");
  ok(!br.blocos.pt && !br.blocos.bolso, "simulado sem nomes reais → sem blocos antes do fallback");

  const spRaw: RawUnificado = lerFix("sim-sp71072-u.json");
  const sp = normalizeUnificado(spRaw, { escopo: "mun", uf: "sp", mun: "71072", turno: 1, ambiente: "simulado" });
  console.log(" ", resumo(sp));
  ok(sp.escopo === "mun" && sp.mun === "71072" && sp.eleicao === "21270", "contexto mun");
  console.log("  munRow:", JSON.stringify(toMunRow(sp)));
  // consistência LiveResult.pct × LiveMunRow (pt/vv) quando o bloco é preenchido
  {
    const { mapa } = mapeamentoParaFallback(br);
    ok(mapa.pt === "89" && mapa.bolso === "68", `fallback do simulado prefere destinação "Válido" (pt=${mapa.pt}, bolso=${mapa.bolso})`);
    const spF = aplicarFallbackBlocos(normalizeUnificado(spRaw, { escopo: "mun", uf: "sp", mun: "71072", turno: 1, ambiente: "simulado" }), mapa);
    const row = toMunRow(spF);
    ok(Math.abs(spF.blocos.pt!.pct - (row.pt / row.vv) * 100) < 1e-6, "pct do bloco (LiveResult) == pt/vv (LiveMunRow)");
    ok(Math.abs(spF.candidatos.filter((c) => destinacaoValida(c.destinacao)).reduce((a, c) => a + c.pct, 0) - 100) < 1e-6, "soma dos % dos válidos = 100");
  }

  // placeholder oficial (antes das 17h): blocos por nome
  const fake: RawUnificado = {
    ele: "6257",
    and: "n",
    tf: "n",
    dt: "",
    ht: "",
    dg: "03/10/2026",
    hg: "14:47:37",
    s: { ts: "100", st: "0" },
    carg: [
      {
        cd: "1",
        agr: [
          { par: [{ sg: "PL", cand: [{ n: "22", nm: "FLAVIO NANTES BOLSONARO", nmu: "FLAVIO BOLSONARO", vap: "0", pvapn: "0", e: "n", st: "" }] }] },
          { par: [{ sg: "PT", cand: [{ n: "13", nm: "LUIZ INÁCIO LULA DA SILVA", nmu: "LULA", vap: "0", pvapn: "0", e: "n", st: "" }] }] },
          { par: [{ sg: "PSD", cand: [{ n: "55", nm: "RONALDO RAMOS CAIADO", nmu: "RONALDO CAIADO", vap: "0", pvapn: "0" }] }] },
        ],
      },
    ],
  };
  const fr = normalizeUnificado(fake, { escopo: "br", uf: "br", turno: 1, ambiente: "oficial" });
  ok(fr.blocos.pt?.n === "13" && fr.blocos.bolso?.n === "22" && !fr.blocosPorFallback, "blocos por nome (LULA / FLAVIO BOLSONARO)");
  ok(isNaoIniciado(fake) && !isFinalizado(fake), "placeholder → não iniciado");
  ok(fr.atualizadoEm === "2026-10-03T14:47:37-03:00", "atualizadoEm cai para dg/hg");
  ok(fr.candidatos.every((c) => c.pct === 0), "placeholder (vv = 0) → pct 0");
  // vários "Bolsonaro"/"Flávio" na lista: prefere FLÁVIO ... BOLSONARO; "LULA" só como palavra
  {
    const cand = (n: string, nm: string, nmu: string, vap = "0") => ({ par: [{ sg: "X", cand: [{ n, nm, nmu, vap }] }] });
    const multi: RawUnificado = {
      ...fake,
      v: { vv: "100" },
      s: { ts: "1", st: "1" },
      carg: [{ cd: "1", agr: [
        cand("17", "MICHELLE DE PAULA FIRMO REINALDO BOLSONARO", "MICHELLE BOLSONARO", "50"),
        cand("40", "FLÁVIO ALGUÉM DA SILVA", "FLÁVIO", "20"),
        cand("33", "JOSÉ LULAS PEREIRA", "LULINHA", "10"),
        cand("45", "FLAVIO NANTES BOLSONARO", "FLAVIO BOLSONARO", "15"),
        cand("12", "LUIZ INÁCIO LULA DA SILVA", "LULA", "5"),
      ] }],
    };
    const mr = normalizeUnificado(multi, { escopo: "br", uf: "br", turno: 1, ambiente: "oficial" });
    ok(mr.blocos.bolso?.n === "45" && mr.blocos.pt?.n === "12", `nomes ambíguos → pt=${mr.blocos.pt?.n} bolso=${mr.blocos.bolso?.n} (esperado 12 / 45)`);
  }

  // -------------------------------------------------------------------------
  console.log("\n# Validação de parâmetros");
  const pp = (q: string, ex: Parameters<typeof parseParamsTse>[1]) => parseParamsTse(new URLSearchParams(q), ex);
  ok(!("erro" in pp("uf=SP&mun=71072&turno=2&amb=simulado", { uf: "br-ou-uf", mun: true })), "params válidos");
  ok("erro" in pp("uf=xx", { uf: "br-ou-uf" }), "uf inválida → erro");
  ok("erro" in pp("uf=sp&mun=7107", { uf: "br-ou-uf", mun: true }), "mun inválido → erro");
  ok("erro" in pp("uf=br&mun=71072", { uf: "br-ou-uf", mun: true }), "mun com uf=br → erro");
  ok("erro" in pp("uf=br", { uf: "uf" }), "municipios com uf=br → erro");
  ok("erro" in pp("turno=3", {}), "turno inválido → erro");
  ok("erro" in pp("amb=teste", {}), "amb inválido → erro");
  const d = pp("", {});
  ok(!("erro" in d) && d.turno === 1 && d.ambiente === "oficial", "padrões turno=1 amb=oficial");

  if (offline) return;

  // -------------------------------------------------------------------------
  console.log("\n# Simulado (ao vivo)");
  let t0 = Date.now();
  const sBr = await getResultado({ uf: "br", turno: 1, ambiente: "simulado" });
  console.log(`  br (${ms(t0)}):`, resumo(sBr));
  ok(sBr && sBr.blocos.pt && sBr.blocos.bolso && sBr.blocosPorFallback, "br: blocos via fallback (top-2 nacional)");
  const mapaPt = sBr?.blocos.pt?.n;
  const mapaBo = sBr?.blocos.bolso?.n;

  for (const [uf, mun] of [["sp", undefined], ["sp", "71072"], ["zz", undefined]] as const) {
    t0 = Date.now();
    const r = await getResultado({ uf, mun, turno: 1, ambiente: "simulado" });
    console.log(`  ${uf}${mun ?? ""} (${ms(t0)}):`, resumo(r));
    ok(r && r.blocos.pt?.n === mapaPt && r.blocos.bolso?.n === mapaBo, `${uf}${mun ?? ""}: mesmos números do mapeamento nacional`);
  }

  t0 = Date.now();
  const r2 = await getResultado({ uf: "br", turno: 2, ambiente: "simulado" });
  console.log(`  br t2 (${ms(t0)}):`, resumo(r2));

  t0 = Date.now();
  const est = await getEstados({ turno: 1, ambiente: "simulado" });
  const nulos = Object.entries(est.ufs).filter(([, v]) => !v).map(([k]) => k);
  console.log(`  estados (${ms(t0)}): br=${!!est.br} ufs=${Object.keys(est.ufs).length} nulos=[${nulos.join(",")}]`);
  ok(Object.keys(est.ufs).length === 28 && nulos.length === 0, "estados: 28 UFs (incl. zz), nenhuma nula");
  ok(Object.values(est.ufs).every((u) => u?.blocos.pt?.n === mapaPt), "estados: mapeamento consistente");
  console.log(`  MG: ${resumo(est.ufs.mg)}`);
  t0 = Date.now();
  await getEstados({ turno: 1, ambiente: "simulado" });
  console.log(`  estados (2ª chamada, cache): ${ms(t0)}`);

  for (const uf of ["se", "mg", "zz"]) {
    t0 = Date.now();
    const m = await getMunicipios({ uf, turno: 1, ambiente: "simulado" });
    const n = Object.keys(m.municipios).length;
    const comDados = Object.values(m.municipios).filter((x) => x.pa > 0).length;
    console.log(`  municipios ${uf} (${ms(t0)}): ${n} municípios, ${comDados} com dados, falhas=${m.falhas.length}`);
    const [cd, row] = Object.entries(m.municipios)[0] ?? [];
    console.log(`    ex.: ${cd} ${JSON.stringify(row)}`);
    ok(n > 0 && m.falhas.length === 0, `municipios ${uf}: sem falhas`);
    ok(Object.values(m.municipios).every((x) => x.pa === 0 || x.vv === 0 || !!x.lid), `municipios ${uf}: lid preenchido`);
    ok(Object.values(m.municipios).some((x) => x.pt > 0) && Object.values(m.municipios).some((x) => x.bo > 0), `municipios ${uf}: votos pt/bo presentes`);
  }
  t0 = Date.now();
  const mg2 = await getMunicipios({ uf: "mg", turno: 1, ambiente: "simulado" });
  console.log(`  municipios mg (2ª chamada, cache por carimbo): ${ms(t0)} (${Object.keys(mg2.municipios).length})`);

  // -------------------------------------------------------------------------
  console.log("\n# Oficial (antes das 17h → sem dados)");
  t0 = Date.now();
  const oBr = await getResultado({ uf: "br", turno: 1, ambiente: "oficial" });
  console.log(`  br (${ms(t0)}):`, resumo(oBr));
  const oVazio = await getResultado({ uf: "br", turno: 1, ambiente: "oficial" }, { incluirVazio: true });
  console.log(`  br vazio=1:`, resumo(oVazio));
  if (oBr === null) {
    ok(oVazio && oVazio.blocos.pt?.n === "13" && oVazio.blocos.bolso?.n === "22", "placeholder oficial: LULA→pt, FLAVIO→bolso");
    console.log("   candidatos:", oVazio?.candidatos.map((c) => `${c.n} ${c.nome} (${c.partido})`).join("; "));
  } else {
    ok(oBr.blocos.pt?.n === "13" && oBr.blocos.bolso?.n === "22", "oficial: blocos LULA/FLAVIO");
  }
  const oT2 = await getResultado({ uf: "sp", mun: "71072", turno: 2, ambiente: "oficial" });
  ok(oT2 === null, "oficial 2º turno → null (404)");
  t0 = Date.now();
  const oEst = await getEstados({ turno: 1, ambiente: "oficial" });
  console.log(`  estados (${ms(t0)}): br=${oEst.br ? "dados" : "null"} ufs nulas=${Object.values(oEst.ufs).filter((v) => !v).length}`);
  t0 = Date.now();
  const oMun = await getMunicipios({ uf: "mg", turno: 1, ambiente: "oficial" });
  const oCom = Object.values(oMun.municipios).filter((x) => x.pa > 0).length;
  console.log(`  municipios mg (${ms(t0)}): ${Object.keys(oMun.municipios).length} linhas, ${oCom} com dados, falhas=${oMun.falhas.length}`);
  ok(Object.keys(oMun.municipios).length === 853 && oMun.falhas.length === 0, "oficial mg: 853 linhas, sem falhas");
  const oMun2 = await getMunicipios({ uf: "se", turno: 2, ambiente: "oficial" });
  console.log(`  municipios se t2: ${Object.keys(oMun2.municipios).length} linhas, falhas=${oMun2.falhas.length}`);

  // -------------------------------------------------------------------------
  console.log("\n# Rotas (handlers chamados diretamente)");
  const { NextRequest } = await import("next/server");
  const rotas = {
    resultado: await import("../../src/app/api/tse/resultado/route"),
    estados: await import("../../src/app/api/tse/estados/route"),
    municipios: await import("../../src/app/api/tse/municipios/route"),
  };
  const chamar = async (rota: keyof typeof rotas, q: string) => {
    const res = await rotas[rota].GET(new NextRequest(`http://localhost/api/tse/${rota}?${q}`));
    const body = await res.json();
    return { status: res.status, cc: res.headers.get("cache-control"), body };
  };
  let x = await chamar("resultado", "uf=sp&mun=71072&amb=simulado");
  console.log(`  resultado sp71072 simulado → ${x.status} [${x.cc}] ${x.body.escopo} ${x.body.mun}`);
  ok(x.status === 200 && x.cc?.includes("s-maxage=15"), "200 + Cache-Control live");
  x = await chamar("resultado", "uf=br&turno=1");
  console.log(`  resultado br oficial → ${x.status} [${x.cc}] ${JSON.stringify(x.body).slice(0, 100)}`);
  ok(x.status === 404 ? x.cc === CACHE_NAO_DIVULGADO && !!x.body.erro : x.status === 200, "oficial antes das 17h → 404 com cache curto");
  x = await chamar("resultado", "uf=br&vazio=1");
  console.log(`  resultado br oficial vazio=1 → ${x.status} cands=${x.body.candidatos?.length}`);
  x = await chamar("resultado", "uf=xx");
  ok(x.status === 400 && x.cc === "no-store", `uf inválida → 400 (${x.body.erro})`);
  x = await chamar("resultado", "uf=sp&mun=abc");
  ok(x.status === 400, `mun inválido → 400 (${x.body.erro})`);
  x = await chamar("estados", "amb=simulado&turno=1");
  ok(x.status === 200 && Object.keys(x.body.ufs).length === 28, `estados simulado → 200 [${x.cc}]`);
  x = await chamar("municipios", "uf=se&amb=simulado");
  ok(x.status === 200 && x.cc?.includes("s-maxage=45"), `municipios se → 200 [${x.cc}] ${Object.keys(x.body.municipios).length} linhas`);
  x = await chamar("municipios", "uf=br");
  ok(x.status === 400, `municipios uf=br → 400 (${x.body.erro})`);
  const tam = JSON.stringify((await chamar("municipios", "uf=mg&amb=simulado")).body).length;
  console.log(`  tamanho JSON municipios mg: ${(tam / 1024).toFixed(1)} KB`);
  const tamE = JSON.stringify((await chamar("estados", "amb=simulado")).body).length;
  console.log(`  tamanho JSON estados: ${(tamE / 1024).toFixed(1)} KB`);
}

main()
  .catch((e) => {
    falhas++;
    console.error("ERRO:", e);
  })
  .finally(() => {
    console.log(falhas ? `\n${falhas} FALHA(S)` : "\nOK — todos os testes passaram");
    process.exit(falhas ? 1 : 0);
  });
