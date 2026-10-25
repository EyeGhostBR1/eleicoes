// Teste do módulo de resultados do exterior por boletins de urna (BU).
//   npx tsx scripts/dev/test-exterior.ts            (unitários + chamada AO VIVO ao TSE oficial + rota)
//   npx tsx scripts/dev/test-exterior.ts --offline  (só unitários com fixtures)
// Recomendado (evita 429 do CDN do TSE):
//   PowerShell: $env:NODE_OPTIONS="--dns-result-order=ipv4first"; $env:TSE_MAX_RPS="30"; npx tsx scripts/dev/test-exterior.ts
//   bash:       NODE_OPTIONS=--dns-result-order=ipv4first TSE_MAX_RPS=30 npx tsx scripts/dev/test-exterior.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeBU, filhos, lerInteiro, lerTlv, isoLocalDeDataHoraJE, BerError } from "../../src/lib/exterior/bu";
import {
  escolherHash,
  getExterior,
  getUltimaStatsExterior,
  parseConfigSecoes,
  resolverPleito,
  tituloCase,
  urlAuxSecao,
  urlBuSecao,
  urlConfigSecoesExterior,
  type RawConfigSecoes,
} from "../../src/lib/exterior/service";
import type { ExtAgregado, ExteriorResponse } from "../../src/lib/types";

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
const ms = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "—");
const lancou = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof BerError;
  }
};

/** Invariantes de um agregado (supõe nenhum candidato "anulado sub judice" na lista oficial). */
function checarAgregado(a: ExtAgregado, cands: ExteriorResponse["candidatos"]): boolean {
  const somaVotos = Object.values(a.votos).reduce((x, y) => x + y, 0);
  const temLista = Object.keys(cands).length > 0;
  return (
    (!temLista || Object.keys(a.votos).every((n) => cands[n])) &&
    a.pt === (a.votos["13"] ?? 0) &&
    a.bo === (a.votos["22"] ?? 0) &&
    a.validos === somaVotos &&
    a.validos + a.brancos + a.nulos === a.comparecimento &&
    a.secoesRecebidas <= a.secoesTotal &&
    a.comparecimento <= a.aptos
  );
}

function resumoResposta(r: ExteriorResponse) {
  const t = r.total;
  console.log(
    `  total: ${t.secoesRecebidas}/${t.secoesTotal} seções | aptos ${t.aptos} | comp ${t.comparecimento} (${pct(t.comparecimento, t.aptos)})` +
      ` | válidos ${t.validos} | brancos ${t.brancos} | nulos ${t.nulos}`,
  );
  console.log(`  Lula (13): ${t.pt} = ${pct(t.pt, t.validos)} | Flávio (22): ${t.bo} = ${pct(t.bo, t.validos)} | última recepção ${r.ultimaRecepcao}`);
  const outros = Object.entries(t.votos)
    .filter(([n]) => n !== "13" && n !== "22")
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `${n} ${r.candidatos[n]?.nome ?? "?"}=${v}`)
    .join(", ");
  console.log(`  demais: ${outros || "—"}`);
  const paises = Object.values(r.paises)
    .filter((p) => p.secoesRecebidas > 0)
    .sort((a, b) => b.validos - a.validos);
  console.log(`  países com BU: ${paises.length}/${Object.keys(r.paises).length}`);
  for (const p of paises.slice(0, 15)) {
    console.log(
      `    ${(p.pais + " (" + p.iso2 + ")").padEnd(26)} ${String(p.secoesRecebidas).padStart(4)}/${String(p.secoesTotal).padEnd(4)} seç.` +
        ` | válidos ${String(p.validos).padStart(6)} | Lula ${pct(p.pt, p.validos).padStart(6)} | Flávio ${pct(p.bo, p.validos).padStart(6)}`,
    );
  }
}

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n# DER/BER: inteiros e TLV");
  const int = (...bs: number[]) => lerInteiro(new Uint8Array([2, bs.length, ...bs]), lerTlv(new Uint8Array([2, bs.length, ...bs]), 0));
  ok(int(0x00, 0x88) === 136, "INTEGER 00 88 = 136 (byte de sinal)");
  ok(int(0xff) === -1 && int(0x80) === -128 && int(0xff, 0x7f) === -129, "complemento de dois (-1, -128, -129)");
  ok(int(0x18, 0x71) === 6257, "INTEGER 18 71 = 6257");
  // tag multi-byte [C 200] construída + comprimento longo + comprimento indefinido
  const multi = new Uint8Array([0xbf, 0x81, 0x48, 0x81, 0x03, 0x02, 0x01, 0x07]);
  const tm = lerTlv(multi, 0);
  ok(tm.tag === 200 && tm.classe === 2 && tm.construido && filhos(multi, tm).length === 1, "tag longa (200) + comprimento 81 03");
  const indef = new Uint8Array([0x30, 0x80, 0x02, 0x01, 0x05, 0x02, 0x01, 0x06, 0x00, 0x00]);
  const ti = lerTlv(indef, 0);
  ok(ti.proximo === indef.length && filhos(indef, ti).length === 2, "comprimento indefinido (BER) com EOC");
  ok(lancou(() => lerTlv(new Uint8Array([0x30, 0x05, 0x02, 0x01]), 0)), "comprimento além do buffer → BerError");
  ok(isoLocalDeDataHoraJE("20261004T170532") === "2026-10-04T17:05:32", "data/hora JE → ISO local");

  // -------------------------------------------------------------------------
  console.log("\n# decodeBU (fixture Pequim, seção 0963)");
  const bytes = new Uint8Array(readFileSync(join(FIX, "bu-zz-30317-0001-0963.dat")));
  const bu = decodeBU(bytes, 6257, 1);
  ok(bu != null, "decodifica");
  if (bu) {
    ok(bu.mun === "30317" && bu.zona === "0001" && bu.secao === "0963" && bu.local === 1015, `identificação ${bu.mun}/${bu.zona}/${bu.secao} local ${bu.local}`);
    ok(bu.aptos === 342 && bu.comparecimento === 136, `aptos ${bu.aptos}, comparecimento ${bu.comparecimento}`);
    const esperado = { "13": 104, "14": 1, "22": 22, "27": 1, "55": 1, "70": 3, "80": 2 };
    ok(JSON.stringify(bu.votos) === JSON.stringify(esperado), `votos ${JSON.stringify(bu.votos)}`);
    ok(bu.brancos === 0 && bu.nulos === 2 && bu.legenda === 0 && bu.outros === 0, `brancos ${bu.brancos} nulos ${bu.nulos} legenda ${bu.legenda} outros ${bu.outros}`);
    ok(!bu.inconsistente, "checksum: 134 + 2 = 136");
    ok(bu.emissaoRaw === "20261004T170532" && bu.emissao === "2026-10-04T17:05:32", `emissão ${bu.emissao} (hora local)`);
  }
  ok(decodeBU(bytes, 6258, 1) === null, "outra eleição → null");
  ok(decodeBU(bytes, 6257, 3) === null, "outro cargo → null");
  ok(lancou(() => decodeBU(bytes.slice(0, 600), 6257)), "arquivo truncado → BerError");
  ok(lancou(() => decodeBU(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]), 6257)), "DER sem BU → BerError");
  // BU sem o envelope (só o conteúdo do OCTET STRING)
  const raiz = lerTlv(bytes, 0);
  const oct = filhos(bytes, raiz).find((c) => c.classe === 0 && c.tag === 4 && bytes[c.valor] === 0x30)!;
  const interno = decodeBU(bytes.slice(oct.valor, oct.fim), 6257);
  ok(interno != null && interno.votos["13"] === 104 && interno.secao === "0963", "BU sem envelope também decodifica");
  // checksum: altera 104 → 105 votos para o 13
  const alterado = bytes.slice();
  let pos = -1;
  for (let i = 0; i < alterado.length - 8; i++)
    if (alterado[i] === 0x82 && alterado[i + 1] === 0x01 && alterado[i + 2] === 0x68 && alterado[i + 3] === 0xa3 && alterado[i + 7] === 0x0d) {
      pos = i + 2;
      break;
    }
  ok(pos > 0, `byte da quantidade do 13 achado (offset ${pos})`);
  alterado[pos] = 0x69;
  const inc = decodeBU(alterado, 6257);
  ok(inc?.inconsistente === true && inc.votos["13"] === 105, "checksum divergente → inconsistente = true");

  // -------------------------------------------------------------------------
  console.log("\n# Lista de seções (fixture cs)");
  const cs = JSON.parse(readFileSync(join(FIX, "oficial-zz-p003220-cs.json"), "utf8")) as RawConfigSecoes;
  const cidades = parseConfigSecoes(cs, "3220");
  const nSec = cidades.reduce((a, c) => a + c.secoes.length, 0);
  ok(cidades.length === 186, `${cidades.length} cidades`);
  ok(nSec === 1351, `${nSec} seções não agregadas`);
  const buda = cidades.find((c) => c.cd === "29459");
  ok(buda?.secoes.map((s) => s.secao).join(",") === "1695,1696", "Budapeste: agregada 3124 pulada");
  ok(urlConfigSecoesExterior("3220") === "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/config/zz/zz-p003220-cs.json", "URL cs");
  ok(
    urlAuxSecao("3220", "30317", "0001", "0963") ===
      "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/dados/zz/30317/0001/0963/p003220-zz-m30317-z0001-s0963-aux.json",
    "URL aux",
  );
  ok(urlBuSecao("3220", "30317", "0001", "0963", "abc", "x-bu.dat").endsWith("/dados/zz/30317/0001/0963/abc/x-bu.dat"), "URL BU");

  console.log("\n# escolherHash / tituloCase");
  const arq = (n: string) => [{ nm: `${n}-vota.vsc`, tp: "vota" }, { nm: `${n}-bu.dat`, tp: "bu" }];
  const h1 = escolherHash({
    hashes: [
      { hash: "aa", st: "Recebido", dr: "04/10/2026", hr: "06:00:00", arq: arq("a") },
      { hash: "bb", st: "Recebido", dr: "04/10/2026", hr: "07:00:00", arq: arq("b") },
      { hash: "cc", st: "Excluído", dr: "04/10/2026", hr: "08:00:00", arq: arq("c") },
    ],
  });
  ok(h1?.hash === "bb" && h1.arquivo === "b-bu.dat", "último 'Recebido' (ignora 'Excluído' posterior)");
  ok(escolherHash({ hashes: [{ hash: "dd", st: "Totalizado", arq: arq("d") }] })?.hash === "dd", "'Totalizado' aceito");
  ok(escolherHash({ hashes: [{ hash: "ee", st: "Excluído", arq: arq("e") }] }) === null, "só 'Excluído' → null");
  ok(escolherHash({ hashes: [{ hash: "ff", st: "Recebido", arq: [{ nm: "x-log.jez", tp: "log" }] }] }) === null, "sem arquivo bu → null");
  ok(escolherHash({ hashes: [{ hash: "../x", st: "Recebido", arq: arq("g") }] }) === null, "hash com caracteres inválidos → null");
  ok(tituloCase("CIUDAD DEL ESTE") === "Ciudad del Este" && tituloCase("PEQUIM") === "Pequim", "tituloCase");

  // -------------------------------------------------------------------------
  // getExterior com fetch SIMULADO (sem tráfego ao TSE): estado por seção ao longo do tempo
  console.log("\n# getExterior com fetch simulado");
  const fetchReal = globalThis.fetch;
  const nowReal = Date.now;
  const pedidos: string[] = [];
  const lixo = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]);
  const csMock: RawConfigSecoes = {
    abr: [
      {
        cd: "zz",
        mu: [
          { cd: "30317", nm: "PEQUIM", zon: [{ cd: "0001", sec: [{ ns: "0963" }] }] },
          { cd: "29548", nm: "SINGAPURA", zon: [{ cd: "0001", sec: [{ ns: "0506", nsa: ["3326"] }, { ns: "3326", nsp: "0506" }, { ns: "0509" }] }] },
        ],
      },
    ],
  };
  const auxMock = (hs: { hash: string; st: string; nm?: string }[]) =>
    JSON.stringify({
      dg: "04/10/2026",
      hg: "06:21:50",
      st: "Recebida",
      hashes: hs.map((h) => ({ hash: h.hash, dr: "04/10/2026", hr: "06:21:50", st: h.st, arq: [{ nm: h.nm ?? "o-bu.dat", tp: "bu" }] })),
    });
  let hashesPequim = [
    { hash: "a1", st: "Recebido", nm: "a-bu.dat" },
    { hash: "a2", st: "Recebido", nm: "b-bu.dat" },
  ];
  let modo429 = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    pedidos.push(url);
    const r = (status: number, body: BodyInit = "", ct = "application/json") => new Response(body, { status, headers: { "content-type": ct } });
    if (url.endsWith("-cs.json")) return r(200, JSON.stringify(csMock));
    if (modo429) return r(429);
    if (url.includes("/30317/0001/0963/")) {
      if (url.endsWith("-aux.json")) return r(200, auxMock(hashesPequim));
      if (url.endsWith("/a1/a-bu.dat")) return r(200, lixo, "application/octet-stream");
      if (url.endsWith("/a2/b-bu.dat") || url.endsWith("/a3/c-bu.dat")) return r(200, bytes, "application/octet-stream");
    }
    if (url.includes("/29548/0001/0506/")) return url.endsWith("-aux.json") ? r(200, auxMock([{ hash: "x1", st: "Recebido" }])) : r(200, lixo, "application/octet-stream");
    if (url.includes("/29548/0001/0509/") && url.endsWith("-aux.json")) return r(200, auxMock([{ hash: "y1", st: "Recebido" }]));
    return r(404, "<Error><Code>NoSuchKey</Code></Error>", "application/xml");
  }) as typeof fetch;
  const avancar = (min: number) => {
    const d = min * 60_000;
    Date.now = () => nowReal() + d;
  };
  const { limparEstadoExterior, statsDaResposta } = await import("../../src/lib/exterior/service");
  const { limparCacheTse } = await import("../../src/lib/tse/fetch");
  try {
    limparEstadoExterior();
    const m1 = await getExterior({ turno: 1 }, { prazoMs: 10_000 });
    const s1 = m1 && statsDaResposta(m1);
    ok(m1?.total.secoesTotal === 3 && m1.cidades["29548"].secoesTotal === 2, "seção agregada (nsp) fora do total: 3 seções");
    ok(!pedidos.some((u) => u.includes("/3326/")), "seção agregada nunca é consultada");
    ok(m1?.cidades["30317"].secoesRecebidas === 1 && m1.cidades["30317"].votos["13"] === 104, "multi-hash: usa o ÚLTIMO 'Recebido' (a2)");
    ok(!pedidos.some((u) => u.includes("/a1/")), "hash anterior (a1) nem é baixado");
    ok(m1?.cidades["29548"].secoesRecebidas === 0, "BU que não decodifica e BU ainda 404 não contam como recebidas");
    ok(s1?.novasRecebidas === 1 && s1.falhas === 1 && s1.naoRecebidas === 1 && s1.completo, `stats 1ª: ${JSON.stringify(s1)}`);
    let n = pedidos.length;
    await getExterior({ turno: 1 }, { prazoMs: 10_000 });
    ok(pedidos.length === n, "2ª chamada imediata: nenhuma requisição (backoff de 404/falha/recebida)");

    // +11 min: re-transmissão (a2 excluído, a3 novo)
    hashesPequim = [
      { hash: "a1", st: "Excluído", nm: "a-bu.dat" },
      { hash: "a2", st: "Excluído", nm: "b-bu.dat" },
      { hash: "a3", st: "Recebido", nm: "c-bu.dat" },
    ];
    avancar(11);
    n = pedidos.length;
    const m3 = await getExterior({ turno: 1 }, { prazoMs: 10_000 });
    const s3 = m3 && statsDaResposta(m3);
    ok(pedidos.slice(n).some((u) => u.endsWith("/a3/c-bu.dat")), "re-transmissão: o BU do hash novo é baixado");
    ok(s3?.substituidas === 1 && m3?.cidades["30317"].secoesRecebidas === 1, "seção substituída, contada 1 vez");
    ok(!pedidos.slice(n).some((u) => u.includes("/0506/x1/")), "BU inválido não é baixado de novo (mesmo hash)");

    // +22 min: TSE exclui todos os hashes de Pequim
    hashesPequim = hashesPequim.map((h) => ({ ...h, st: "Excluído" }));
    avancar(22);
    const m4 = await getExterior({ turno: 1 }, { prazoMs: 10_000 });
    ok(m4?.cidades["30317"].secoesRecebidas === 0 && statsDaResposta(m4!)?.removidas === 1, "todos os hashes excluídos → seção deixa de contar");
    Date.now = nowReal;

    if (offline) {
      // 429 em tudo (abre a pausa global de 20 s — por isso só no modo offline)
      const { NextRequest } = await import("next/server");
      const rota = await import("../../src/app/api/exterior/route");
      limparEstadoExterior();
      modo429 = true;
      n = pedidos.length;
      const t429 = Date.now();
      const res = await rota.GET(new NextRequest("http://localhost/api/exterior?turno=1"));
      const s429 = getUltimaStatsExterior();
      ok(s429?.interrompidoPorPausa === true && !s429.completo, "429 persistente interrompe a execução");
      ok(pedidos.length - n <= 8 && Date.now() - t429 < 5_000, `tempestade de 429: ${pedidos.length - n} requisições, ${Date.now() - t429} ms`);
      ok(res.status === 502 && res.headers.get("cache-control") === "no-store", `rota sem dados + TSE limitando → ${res.status} [${res.headers.get("cache-control")}]`);
    }
  } finally {
    globalThis.fetch = fetchReal;
    Date.now = nowReal;
    limparEstadoExterior();
    limparCacheTse();
  }

  if (offline) return;

  // -------------------------------------------------------------------------
  console.log(`\n# AO VIVO — TSE oficial (TSE_MAX_RPS=${process.env.TSE_MAX_RPS ?? "padrão"}, NODE_OPTIONS=${process.env.NODE_OPTIONS ?? ""})`);
  ok((await resolverPleito(1))?.pleito === "3220", "turno 1 → pleito 3220 / eleição 6257");
  let t0 = Date.now();
  const p2 = await resolverPleito(2);
  console.log(`  turno 2 → ${p2 ? JSON.stringify(p2) : "null (ainda sem pleito no ele-c.json)"} (${ms(t0)})`);

  t0 = Date.now();
  const frio = await getExterior({ turno: 1 });
  const tFrio = Date.now() - t0;
  console.log(`  chamada FRIA: ${ms(t0)} — stats ${JSON.stringify(getUltimaStatsExterior())}`);
  ok(frio != null, "getExterior(turno 1) ≠ null");
  ok(tFrio < 50_000, `fria dentro de ~50 s (${(tFrio / 1000).toFixed(1)} s)`);
  if (frio) resumoResposta(frio);

  t0 = Date.now();
  const morno = await getExterior({ turno: 1 });
  console.log(`  2ª chamada: ${ms(t0)} — stats ${JSON.stringify(getUltimaStatsExterior())}`);
  t0 = Date.now();
  const quente = await getExterior({ turno: 1 });
  const tQuente = Date.now() - t0;
  console.log(`  3ª chamada (quente): ${ms(t0)} — stats ${JSON.stringify(getUltimaStatsExterior())}`);
  ok(tQuente < 5_000, "quente < 5 s (tudo em cache/negativo recente)");
  const r = quente ?? morno ?? frio;
  if (r) {
    console.log("\n  ## Resultado (3ª chamada)");
    resumoResposta(r);
    const tot = r.total;
    ok(Object.keys(r.cidades).length === 186 && tot.secoesTotal === 1351, `186 cidades / 1351 seções (${tot.secoesTotal})`);
    ok(checarAgregado(tot, r.candidatos), "total consistente (válidos+brancos+nulos = comparecimento; pt/bo = votos 13/22; só números da lista oficial)");
    ok(Object.values(r.paises).every((p) => checarAgregado(p, r.candidatos)), "países consistentes");
    ok(Object.values(r.cidades).every((c) => checarAgregado(c, r.candidatos)), "cidades consistentes");
    const somaPaises = Object.values(r.paises).reduce((a, p) => a + p.secoesRecebidas, 0);
    ok(somaPaises === tot.secoesRecebidas, "Σ países = total");
    ok(Object.values(r.paises).every((p) => p.cidades.every((cd) => r.cidades[cd]?.pais === p.pais)), "cidades ↔ país");
    const semPais = Object.values(r.cidades).filter((c) => c.pais === "Outros").map((c) => c.cd);
    ok(semPais.length === 0, `todas as cidades com país (sem país: ${semPais.join(",") || "—"})`);
    ok(Object.keys(r.candidatos).length >= 2, `candidatos: ${Object.entries(r.candidatos).map(([n, c]) => `${n} ${c.nome} (${c.partido})`).join("; ")}`);
    const pequim = r.cidades["30317"];
    console.log(`  Pequim: ${JSON.stringify({ ...pequim, votos: undefined })} votos=${JSON.stringify(pequim?.votos)}`);
    ok(pequim?.nome === "Pequim" && pequim.pais === "China" && pequim.secoesRecebidas >= 1 && (pequim.votos["13"] ?? 0) >= 104, "Pequim inclui a seção 0963");
    ok(r.ultimaRecepcao == null || /-03:00$/.test(r.ultimaRecepcao), `ultimaRecepcao ISO -03:00 (${r.ultimaRecepcao})`);
  }

  console.log("\n# Turno 2");
  t0 = Date.now();
  const t2 = await getExterior({ turno: 2 });
  ok(t2 === null || (p2 != null && t2 != null), `turno 2 → ${t2 === null ? "null" : "dados"} (${ms(t0)})`);

  // -------------------------------------------------------------------------
  console.log("\n# Rota (handler chamado diretamente)");
  const { NextRequest } = await import("next/server");
  const rota = await import("../../src/app/api/exterior/route");
  ok(rota.maxDuration === 60 && rota.dynamic === "force-dynamic" && rota.runtime === "nodejs", "segment config (60 s, force-dynamic, nodejs)");
  const chamar = async (q: string) => {
    const t = Date.now();
    const res = await rota.GET(new NextRequest(`http://localhost/api/exterior${q}`));
    const corpo = await res.json();
    return { status: res.status, cc: res.headers.get("cache-control"), corpo, t: Date.now() - t };
  };
  const r400 = await chamar("?turno=3");
  ok(r400.status === 400 && r400.cc === "no-store" && typeof r400.corpo.erro === "string", `turno=3 → 400 (${r400.corpo.erro})`);
  const r404 = await chamar("?turno=2");
  ok(r404.status === 404 && /s-maxage=60/.test(r404.cc ?? ""), `turno=2 → ${r404.status} [${r404.cc}] ${r404.corpo.erro ?? ""}`);
  const r200 = await chamar("?turno=1");
  const ccEsperado = getUltimaStatsExterior()?.completo
    ? "public, s-maxage=60, stale-while-revalidate=600"
    : "public, s-maxage=10, stale-while-revalidate=60";
  ok(
    r200.status === 200 && r200.cc === ccEsperado && r200.corpo.fonte === "boletins-de-urna",
    `turno=1 → ${r200.status} [${r200.cc}] ${r200.corpo.total?.secoesRecebidas}/${r200.corpo.total?.secoesTotal} seções (${r200.t} ms)`,
  );
  const tamanho = JSON.stringify(r200.corpo).length;
  console.log(`  tamanho do JSON: ${(tamanho / 1024).toFixed(1)} KB`);
  const rPad = await chamar("");
  ok(rPad.status === 200, "sem turno → padrão 1");
}

main()
  .catch((e) => {
    falhas++;
    console.error("ERRO", e);
  })
  .finally(() => {
    console.log(falhas ? `\n${falhas} falha(s)` : "\nOK — tudo passou");
    process.exit(falhas ? 1 : 0);
  });
