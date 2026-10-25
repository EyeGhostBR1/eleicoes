// Gera src/lib/maiores-cidades.ts: os N maiores municípios do Brasil pelo eleitorado apto do
// 2º turno de 2022 (public/data/hist). Usado pelo painel 1º × 2º turno (/painel).
//
//   npx tsx scripts/dev/gerar-maiores-cidades.ts [N=50]   (rodar a partir da raiz do projeto)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HistMunFile, MunicipioTuple } from "../../src/lib/types";

const N = Number(process.argv[2] ?? 50);
const ROOT = process.cwd();
const lista = JSON.parse(readFileSync(join(ROOT, "public/data/municipios.json"), "utf8")) as MunicipioTuple[];
const nome = new Map(lista.map((t) => [`${t[2]}:${t[0]}`, t[1]]));
const itens: { cd: string; uf: string; nome: string; ap: number }[] = [];
for (const f of readdirSync(join(ROOT, "public/data/hist/mun"))) {
  const uf = f.replace(".json", "");
  if (uf === "zz") continue;
  const h = JSON.parse(readFileSync(join(ROOT, "public/data/hist/mun", f), "utf8")) as HistMunFile;
  for (const [cd, by] of Object.entries(h)) {
    const ap = by["2022"]?.["2"]?.ap ?? by["2022"]?.["1"]?.ap ?? 0;
    const n = nome.get(`${uf}:${cd}`);
    if (n && ap > 0) itens.push({ cd, uf, nome: n, ap });
  }
}
itens.sort((a, b) => b.ap - a.ap);
const top = itens.slice(0, N);
const linhas = top.map((c) => `  [${JSON.stringify(c.cd)}, ${JSON.stringify(c.uf)}, ${JSON.stringify(c.nome)}, ${c.ap}],`);
writeFileSync(
  join(ROOT, "src/lib/maiores-cidades.ts"),
  `// GERADO por scripts/dev/gerar-maiores-cidades.ts — não editar à mão.
// Os ${N} maiores municípios pelo eleitorado apto do 2º turno de 2022 (sem o exterior).
// [código TSE, UF minúscula, nome, eleitorado 2022]
export const MAIORES_CIDADES: [cd: string, uf: string, nome: string, eleitorado2022: number][] = [
${linhas.join("\n")}
];
`,
  "utf8",
);
console.log(`${top.length} cidades; última: ${top[top.length - 1].nome} (${top[top.length - 1].ap})`);
