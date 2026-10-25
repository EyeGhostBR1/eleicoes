// Verifica os TopoJSON gerados por build_geo.mjs e grava SVGs de amostra.
//
//   npx tsx scripts/geo/check_geo.ts [--out <dir>] [--cm <mun-e006257-cm.json>]
//
// - conta feições e valida ids (uf: 27 siglas únicas; mun: código IBGE de 7 dígitos
//   da própria UF, sem duplicatas);
// - cobertura: todo município (cdi IBGE) do arquivo de configuração do TSE, exceto
//   exterior ("zz"), precisa ter geometria no arquivo da sua UF;
// - grava out/uf-sample.svg (UFs com cores aleatórias) e out/mun-<uf>-sample.svg.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { feature } from "topojson-client";
import { geoMercator, geoPath } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { UFS } from "../../src/lib/config";

const ROOT = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const argVal = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const OUT = argVal("--out", path.join(os.tmpdir(), "apuracao-geo-check"));
const CM = argVal("--cm", path.join(ROOT, "test-fixtures", "tse", "oficial-mun-e006257-cm.json"));
const SAMPLE_UFS = argVal("--sample", "sp,mg,df,rj").split(",");
fs.mkdirSync(OUT, { recursive: true });

const ESTADOS = UFS.filter((u) => u.sigla !== "zz");
let erros = 0;
const erro = (m: string) => {
  erros++;
  console.log("  ERRO: " + m);
};

function load<P extends Record<string, unknown>>(file: string, obj: string): FeatureCollection<Geometry, P> {
  const topo = JSON.parse(fs.readFileSync(file, "utf8")) as Topology;
  const o = topo.objects[obj] as GeometryCollection<P> | undefined;
  if (!o) throw new Error(`${file}: objeto "${obj}" ausente (tem: ${Object.keys(topo.objects)})`);
  return feature(topo, o) as unknown as FeatureCollection<Geometry, P>;
}

function svgOf<P extends Record<string, unknown>>(fc: FeatureCollection<Geometry, P>, fill: (p: P, i: number) => string, title: string): string {
  const W = 800;
  const proj = geoMercator().fitWidth(W, fc);
  const gp = geoPath(proj);
  const [[, y0], [, y1]] = gp.bounds(fc);
  const H = Math.ceil(y1 - y0 + 2);
  proj.translate([proj.translate()[0], proj.translate()[1] - y0 + 1]);
  const paths = fc.features
    .map((f, i) => `<path d="${gp(f) ?? ""}" fill="${fill(f.properties, i)}" stroke="#fff" stroke-width="0.5"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>${title}</title><rect width="100%" height="100%" fill="#f8fafc"/>\n${paths}\n</svg>`;
}

const rnd = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};
const randColor = (i: number) => `hsl(${Math.floor(rnd(i) * 360)} 65% ${45 + Math.floor(rnd(i + 7) * 25)}%)`;

// ---------------------------------------------------------------------------
console.log("== public/geo/uf.json");
const ufFile = path.join(ROOT, "public", "geo", "uf.json");
const ufFc = load<{ uf: string; nome: string }>(ufFile, "uf");
console.log(`  ${ufFc.features.length} feições, ${(fs.statSync(ufFile).size / 1024).toFixed(1)} KB`);
{
  const ids = ufFc.features.map((f) => f.properties.uf);
  const set = new Set(ids);
  if (ids.length !== 27) erro(`esperado 27 UFs, veio ${ids.length}`);
  if (set.size !== ids.length) erro("UFs duplicadas");
  for (const u of ESTADOS) if (!set.has(u.sigla)) erro(`UF ausente: ${u.sigla}`);
  for (const f of ufFc.features) if (!f.properties.nome) erro(`UF sem nome: ${f.properties.uf}`);
  for (const f of ufFc.features) if (!f.geometry) erro(`UF sem geometria: ${f.properties.uf}`);
}
fs.writeFileSync(path.join(OUT, "uf-sample.svg"), svgOf(ufFc, (_p, i) => randColor(i), "UFs"));

// ---------------------------------------------------------------------------
console.log("== public/geo/mun/{uf}.json");
const geomPorUf = new Map<string, Set<string>>();
let totalFeat = 0;
for (const u of ESTADOS) {
  const file = path.join(ROOT, "public", "geo", "mun", `${u.sigla}.json`);
  if (!fs.existsSync(file)) {
    erro(`arquivo ausente: ${file}`);
    continue;
  }
  const fc = load<{ ibge: string }>(file, "mun");
  const ids = fc.features.map((f) => f.properties.ibge);
  const set = new Set(ids);
  totalFeat += ids.length;
  geomPorUf.set(u.sigla, set);
  if (set.size !== ids.length) erro(`${u.sigla}: ids duplicados`);
  for (const id of ids) {
    if (typeof id !== "string" || !/^\d{7}$/.test(id)) erro(`${u.sigla}: id inválido ${JSON.stringify(id)}`);
    else if (!id.startsWith(u.ibge)) erro(`${u.sigla}: id ${id} não pertence à UF ${u.ibge}`);
  }
  for (const f of fc.features) if (!f.geometry) erro(`${u.sigla}: ${f.properties.ibge} sem geometria`);
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ${u.sigla}: ${String(ids.length).padStart(4)} feições  ${kb.padStart(6)} KB`);
  if (SAMPLE_UFS.includes(u.sigla)) {
    fs.writeFileSync(path.join(OUT, `mun-${u.sigla}-sample.svg`), svgOf(fc, (_p, i) => randColor(i), u.nome));
  }
}
console.log(`  total: ${totalFeat} feições`);

// ---------------------------------------------------------------------------
console.log("== cobertura vs. TSE (" + path.basename(CM) + ")");
type CmFile = { abr: { cd: string; ds: string; mu: { cd: string; cdi: string; nm: string }[] }[] };
const cm = JSON.parse(fs.readFileSync(CM, "utf8")) as CmFile;
const faltando: string[] = [];
const semCdi: string[] = [];
const tseIbge = new Set<string>();
let nTse = 0;
for (const abr of cm.abr) {
  if (abr.cd === "zz") continue;
  const geo = geomPorUf.get(abr.cd);
  for (const m of abr.mu) {
    nTse++;
    if (!m.cdi) {
      semCdi.push(`${abr.cd}/${m.cd} ${m.nm}`);
      continue;
    }
    tseIbge.add(m.cdi);
    if (!geo?.has(m.cdi)) faltando.push(`${abr.cd} TSE ${m.cd} IBGE ${m.cdi} ${m.nm}`);
  }
}
const sobrando: string[] = [];
for (const [uf, set] of geomPorUf) for (const id of set) if (!tseIbge.has(id)) sobrando.push(`${uf} IBGE ${id}`);
console.log(`  municípios TSE (sem exterior): ${nTse}; com geometria: ${nTse - faltando.length - semCdi.length}`);
console.log(`  sem código IBGE no TSE: ${semCdi.length}${semCdi.length ? " → " + semCdi.join("; ") : ""}`);
console.log(`  TSE sem geometria: ${faltando.length}${faltando.length ? "\n    " + faltando.join("\n    ") : ""}`);
console.log(`  geometrias sem município TSE: ${sobrando.length}${sobrando.length ? "\n    " + sobrando.join("\n    ") : ""}`);

console.log(`\nSVGs de amostra em ${OUT}`);
console.log(erros ? `${erros} erro(s) estrutural(is)` : "OK — sem erros estruturais");
process.exitCode = erros ? 1 : 0;
