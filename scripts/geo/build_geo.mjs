#!/usr/bin/env node
// Gera os mapas estáticos (TopoJSON) usados pelo site a partir das malhas do IBGE.
//
//   node scripts/geo/build_geo.mjs [--cache <dir>] [--res-uf 1400] [--res-mun 1000] [--force]
//
// Saídas:
//   public/geo/uf.json         — 27 UFs, objeto "uf",  propriedades { uf: "sp", nome: "São Paulo" }
//   public/geo/mun/{uf}.json   — municípios da UF, objeto "mun", propriedades { ibge: "3550308" }
//
// Fontes:
//   - API de malhas v3 do IBGE (qualidade "intermediaria"), que hoje serve a malha 2022;
//   - para UFs com municípios criados depois de 2022 (MT: Boa Esperança do Norte, 5101837,
//     instalado em 2025) usa-se a Malha Municipal 2025 do IBGE (shapefile, geoftp).
//
// Os downloads brutos ficam num diretório de cache FORA do projeto
// (padrão: $GEO_CACHE ou <tmp>/apuracao-geo-cache). A simplificação é feita com o
// mapshaper preservando a topologia (fronteiras compartilhadas não abrem frestas).
// A simplificação usa "resolution": a mesma densidade de detalhe por UF, relativa ao
// tamanho da UF (cada mapa estadual é desenhado ocupando toda a largura do componente).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";
import { UFS } from "../../src/lib/config.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = path.join(ROOT, "public", "geo");
const OUT_MUN = path.join(OUT_DIR, "mun");

const args = process.argv.slice(2);
const argVal = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const CACHE = argVal("--cache", process.env.GEO_CACHE || path.join(os.tmpdir(), "apuracao-geo-cache"));
const FORCE = args.includes("--force");
/** grade de saída (px) usada para calcular o intervalo de simplificação */
const RES_UF = Number(argVal("--res-uf", "1400"));
const RES_MUN = Number(argVal("--res-mun", "1000"));
const QUANT = 20000;

const IBGE_API = "https://servicodados.ibge.gov.br/api/v3/malhas";
const IBGE_FTP = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais";
/** UFs cuja malha municipal vem do shapefile anual do IBGE (ano) em vez da API (2022). */
const SHAPEFILE_OVERRIDES = { mt: 2025 };

const ESTADOS = UFS.filter((u) => u.sigla !== "zz");
const UF_POR_IBGE = Object.fromEntries(ESTADOS.map((u) => [u.ibge, u]));

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT_MUN, { recursive: true });

async function download(url, file, { binary = false, tries = 4 } = {}) {
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 1000) return file;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (binary) {
        fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      } else {
        const txt = await r.text();
        JSON.parse(txt); // valida
        fs.writeFileSync(file, txt);
      }
      return file;
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  throw new Error(`falha ao baixar ${url}: ${lastErr}`);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** mapshaper em memória → TopoJSON (texto). `input` = {nome: conteúdo} (arquivos ausentes são lidos do disco). */
async function runMapshaper(cmd, input = {}) {
  const out = await mapshaper.applyCommands(`${cmd} -o out.json format=topojson quantization=${QUANT}`, input);
  return out["out.json"].toString();
}

const simplify = (res) => `-simplify resolution=${res}x${res} weighted keep-shapes`;
const q = (p) => `"${p.replace(/\\/g, "/")}"`;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// ---------------------------------------------------------------------------
// UFs
// ---------------------------------------------------------------------------
{
  const url = `${IBGE_API}/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria`;
  const file = await download(url, path.join(CACHE, "br-uf-intermediaria.json"));
  const gj = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const f of gj.features) {
    const info = UF_POR_IBGE[String(f.properties.codarea)];
    if (!info) throw new Error(`UF desconhecida: ${f.properties.codarea}`);
    f.properties = { uf: info.sigla, nome: info.nome };
  }
  const s = await runMapshaper(`-i in.json name=uf ${simplify(RES_UF)}`, { "in.json": JSON.stringify(gj) });
  fs.writeFileSync(path.join(OUT_DIR, "uf.json"), s);
  console.log(`uf.json   ${gj.features.length} UFs  ${kb(s.length)}`);
}

// ---------------------------------------------------------------------------
// Municípios por UF
// ---------------------------------------------------------------------------
const results = await pool(ESTADOS, 4, async (u) => {
  const ano = SHAPEFILE_OVERRIDES[u.sigla];
  let s;
  let fonte;
  if (ano) {
    const UF = u.sigla.toUpperCase();
    const base = `${UF}_Municipios_${ano}`;
    const zip = await download(
      `${IBGE_FTP}/municipio_${ano}/UFs/${UF}/${base}.zip`,
      path.join(CACHE, `${base}.zip`),
      { binary: true },
    );
    s = await runMapshaper(
      `-i ${q(zip)} -target ${base} -filter-fields CD_MUN -rename-fields ibge=CD_MUN -rename-layers mun ` +
        `-each "ibge=String(ibge)" ${simplify(RES_MUN)}`,
    );
    fonte = `IBGE malha municipal ${ano} (shapefile)`;
  } else {
    const url = `${IBGE_API}/estados/${u.ibge}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria`;
    const file = await download(url, path.join(CACHE, `mun-${u.sigla}-intermediaria.json`));
    const gj = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const f of gj.features) f.properties = { ibge: String(f.properties.codarea) };
    s = await runMapshaper(`-i in.json name=mun ${simplify(RES_MUN)}`, { "in.json": JSON.stringify(gj) });
    fonte = "IBGE API malhas v3 (intermediaria)";
  }
  fs.writeFileSync(path.join(OUT_MUN, `${u.sigla}.json`), s);
  const n = JSON.parse(s).objects.mun.geometries.length;
  return { uf: u.sigla, n, size: s.length, fonte };
});

let total = 0;
for (const r of results) {
  total += r.size;
  console.log(`mun/${r.uf}.json  ${String(r.n).padStart(4)} municípios  ${kb(r.size).padStart(9)}  ${r.fonte}`);
}
console.log(`total: ${results.reduce((a, r) => a + r.n, 0)} municípios  (${kb(total)})`);
