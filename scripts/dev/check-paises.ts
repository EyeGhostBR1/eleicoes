// Verifica o mapeamento cidade do exterior → país (src/lib/exterior/paises-data.ts).
//   npx tsx scripts/dev/check-paises.ts
// Falha (exit 1) se:
//   - alguma cidade "zz" de 2026 (test-fixtures/tse/oficial-mun-e006257-cm.json) ou algum código
//     de public/data/hist/mun/zz.json não estiver mapeado;
//   - iso2 inválido / mesmo país com dois iso2 (ou vice-versa);
//   - um homônimo conhecido (lista HOMONIMOS) foi mapeado para país diferente do decidido;
//   - o nome da cidade contém o nome de OUTRO país (ex.: "KINGSTON-JAMAICA" ≠ Jamaica).
// Imprime a lista de países com nº de cidades e a lista de revisão manual (homônimos).
import { readFileSync } from "node:fs";
import path from "node:path";
import { CIDADE_PAIS, PAIS_NOME_POR_ISO2 } from "../../src/lib/exterior/paises-data";
import { cidadesDoPais, histPorPais, listaPaises, paisDaCidade } from "../../src/lib/exterior/paises";
import type { HistMunFile, MunicipioTuple } from "../../src/lib/types";

const root = process.cwd();
const lerJson = <T,>(rel: string): T => JSON.parse(readFileSync(path.join(root, rel), "utf8")) as T;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const erros: string[] = [];
const avisos: string[] = [];

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
interface CmFile {
  abr: { cd: string; mu: { cd: string; nm: string }[] }[];
}
const cm = lerJson<CmFile>("test-fixtures/tse/oficial-mun-e006257-cm.json");
const zz = cm.abr.find((a) => a.cd === "zz");
if (!zz) throw new Error("UF zz ausente no cm.json");
const nome2026 = new Map(zz.mu.map((m) => [m.cd, m.nm]));

const hist = lerJson<HistMunFile>("public/data/hist/mun/zz.json");
// Nomes dos códigos históricos que não existem em 2026 (dados abertos TSE 2018/2022).
const NOMES_HIST: Record<string, string> = { "99252": "VATICANO", "99406": "FREETOWN", "99422": "LETHEM" };
const nomeDe = (cd: string) => nome2026.get(cd) ?? NOMES_HIST[cd] ?? "?";

// ---------------------------------------------------------------------------
// 1) Cobertura
// ---------------------------------------------------------------------------
const codigos2026 = [...nome2026.keys()];
const codigosHist = Object.keys(hist);
const soHist = codigosHist.filter((cd) => !nome2026.has(cd));
for (const cd of codigos2026) if (!CIDADE_PAIS[cd]) erros.push(`2026 sem país: ${cd} ${nomeDe(cd)}`);
for (const cd of codigosHist) if (!CIDADE_PAIS[cd]) erros.push(`histórico sem país: ${cd} ${nomeDe(cd)}`);
for (const cd of soHist) if (!NOMES_HIST[cd]) avisos.push(`código histórico sem nome conhecido: ${cd}`);
const universo = new Set([...codigos2026, ...codigosHist]);
for (const cd of Object.keys(CIDADE_PAIS)) if (!universo.has(cd)) avisos.push(`código mapeado que não está em 2026 nem no histórico: ${cd}`);

// ---------------------------------------------------------------------------
// 2) Consistência iso2 ↔ país
// ---------------------------------------------------------------------------
const isoDoPais = new Map<string, string>();
const paisDoIso = new Map<string, string>();
for (const [cd, p] of Object.entries(CIDADE_PAIS)) {
  if (!/^[A-Z]{2}$/.test(p.iso2)) erros.push(`iso2 inválido em ${cd}: ${p.iso2}`);
  if (!p.pais.trim()) erros.push(`país vazio em ${cd}`);
  const i = isoDoPais.get(p.pais);
  if (i && i !== p.iso2) erros.push(`país "${p.pais}" com dois iso2: ${i} e ${p.iso2}`);
  isoDoPais.set(p.pais, p.iso2);
  const q = paisDoIso.get(p.iso2);
  if (q && q !== p.pais) erros.push(`iso2 ${p.iso2} com dois nomes: ${q} e ${p.pais}`);
  paisDoIso.set(p.iso2, p.pais);
}
for (const cd of codigos2026) {
  const p = paisDaCidade(cd);
  if (p && p !== CIDADE_PAIS[cd]) erros.push(`paisDaCidade(${cd}) diverge de CIDADE_PAIS`);
}

// ---------------------------------------------------------------------------
// 3) Homônimos / casos ambíguos — decisão registrada + alternativa descartada
// ---------------------------------------------------------------------------
interface Homonimo {
  nome: string;
  esperado: string; // iso2 escolhido
  alternativa: string;
  motivo: string;
}
const HOMONIMOS: Homonimo[] = [
  { nome: "SAINT JOHNS", esperado: "AG", alternativa: "St. John's, Canadá (CA)", motivo: "código 99xxx (posto novo); embaixada do Brasil em Saint John's, Antígua; sem posto em Terra Nova" },
  { nome: "ST GEORGES DE LOYAPOCK", esperado: "GF", alternativa: "St. George's, Granada (GD) / França (FR)", motivo: "Saint-Georges-de-l'Oyapock, fronteira com Oiapoque (AP)" },
  { nome: "CAIENA", esperado: "GF", alternativa: "França (FR)", motivo: "consulado em Caiena; Guiana Francesa mantida separada da França europeia" },
  { nome: "CONCEPCIÓN", esperado: "PY", alternativa: "Concepción, Chile (CL)", motivo: "vice-consulado em Concepción (PY); 2018/2022 ~90% Bolsonaro (brasiguaios)" },
  { nome: "CÓRDOBA", esperado: "AR", alternativa: "Córdoba, Espanha (ES)", motivo: "consulado em Córdoba (AR); Espanha só tem Madri/Barcelona" },
  { nome: "SANTIAGO", esperado: "CL", alternativa: "Santiago de Compostela (ES) / Santiago (DO)", motivo: "embaixada/consulado em Santiago do Chile; ~3 mil aptos" },
  { nome: "TRÍPOLI", esperado: "LY", alternativa: "Trípoli, Líbano (LB)", motivo: "embaixada em Trípoli (Líbia); Líbano coberto por Beirute" },
  { nome: "RIO BRANCO", esperado: "UY", alternativa: "Rio Branco, Acre (BR)", motivo: "vice-consulado em Río Branco (Cerro Largo, UY); cidade 'zz'" },
  { nome: "CHUY", esperado: "UY", alternativa: "Chuí, RS (BR)", motivo: "Chuy é o lado uruguaio" },
  { nome: "SÃO JOSÉ", esperado: "CR", alternativa: "San José, Califórnia (US)", motivo: "embaixada em San José (Costa Rica)" },
  { nome: "SÃO DOMINGOS", esperado: "DO", alternativa: "—", motivo: "Santo Domingo, República Dominicana" },
  { nome: "SÃO SALVADOR", esperado: "SV", alternativa: "Salvador, BA (BR)", motivo: "San Salvador, El Salvador" },
  { nome: "LAGOS", esperado: "NG", alternativa: "Lagos, Portugal (PT)", motivo: "consulado-geral em Lagos (Nigéria); Portugal: Lisboa/Porto/Faro" },
  { nome: "PORTO", esperado: "PT", alternativa: "—", motivo: "consulado-geral no Porto" },
  { nome: "PRAIA", esperado: "CV", alternativa: "—", motivo: "embaixada em Praia, Cabo Verde" },
  { nome: "GEORGETOWN", esperado: "GY", alternativa: "George Town, Malásia/Ilhas Cayman", motivo: "embaixada em Georgetown, Guiana" },
  { nome: "LA PAZ", esperado: "BO", alternativa: "La Paz, México (MX)", motivo: "embaixada em La Paz, Bolívia" },
  { nome: "LONDRES", esperado: "GB", alternativa: "London, Ontário (CA)", motivo: "consulado-geral em Londres" },
  { nome: "HONG KONG", esperado: "CN", alternativa: "Hong Kong (HK)", motivo: "decisão editorial: RAE agregada em China" },
  { nome: "CANTÃO", esperado: "CN", alternativa: "—", motivo: "Guangzhou" },
  { nome: "TAIPÉ", esperado: "TW", alternativa: "China (CN)", motivo: "TSE tem cidade própria; escritório comercial em Taipé" },
  { nome: "RAMALLAH", esperado: "PS", alternativa: "Israel (IL)", motivo: "escritório de representação junto à Palestina" },
  { nome: "NICOSIA", esperado: "CY", alternativa: "—", motivo: "embaixada em Nicósia" },
  { nome: "AMSTERDÃ", esperado: "NL", alternativa: "—", motivo: "consulado-geral (era Roterdã em 2018)" },
  { nome: "VATICANO", esperado: "VA", alternativa: "Itália (IT)", motivo: "embaixada junto à Santa Sé (só 2022, 1 apto)" },
  { nome: "LETHEM", esperado: "GY", alternativa: "—", motivo: "vice-consulado em Lethem, fronteira com Bonfim (RR) (só 2018)" },
  { nome: "SANTA ELENA DE UAIRÉN", esperado: "VE", alternativa: "—", motivo: "fronteira com Pacaraima (RR)" },
  { nome: "PUERTO QUIJARRO", esperado: "BO", alternativa: "—", motivo: "fronteira com Corumbá (MS)" },
  { nome: "PUERTO IGUAZÚ", esperado: "AR", alternativa: "—", motivo: "fronteira com Foz do Iguaçu (PR)" },
  { nome: "MENDOZA", esperado: "AR", alternativa: "—", motivo: "consulado em Mendoza" },
  { nome: "EDIMBURGO", esperado: "GB", alternativa: "—", motivo: "Escócia → Reino Unido" },
  { nome: "MARSELHA", esperado: "FR", alternativa: "—", motivo: "consulado em Marselha" },
];
const cdPorNome = new Map<string, string>();
for (const cd of universo) cdPorNome.set(norm(nomeDe(cd)), cd);
for (const h of HOMONIMOS) {
  const cd = cdPorNome.get(norm(h.nome));
  if (!cd) {
    avisos.push(`homônimo listado mas inexistente nos dados: ${h.nome}`);
    continue;
  }
  const p = CIDADE_PAIS[cd];
  if (!p || p.iso2 !== h.esperado) erros.push(`homônimo ${h.nome} (${cd}) mapeado para ${p?.iso2 ?? "—"}, esperado ${h.esperado}`);
}

// ---------------------------------------------------------------------------
// 4) Heurística: nome da cidade contém o nome de outro país?
// ---------------------------------------------------------------------------
// Variantes (pt/en/es + grafias TSE) por iso2, além do nome pt-BR do mapeamento.
const VARIANTES: Record<string, string[]> = {
  AG: ["ANTIGUA", "BARBUDA"],
  BH: ["BAREIN", "BAHRAIN", "BAHREIN"],
  CN: ["CHINA"],
  DO: ["DOMINICANA"],
  GB: ["INGLATERRA", "ESCOCIA", "ENGLAND", "SCOTLAND", "UNITED KINGDOM"],
  GD: ["GRANADA", "GRENADA"],
  GF: ["GUIANA FRANCESA", "GUYANE"],
  GY: ["GUYANA", "GUIANA"],
  HK: ["HONG KONG"],
  JM: ["JAMAICA"],
  KW: ["KUWAIT", "KUAITE", "KUAIT"],
  LB: ["LIBANO", "LEBANON"],
  MX: ["MEXICO"],
  NL: ["HOLANDA", "NETHERLANDS"],
  PA: ["PANAMA"],
  PS: ["PALESTINA", "PALESTINE"],
  SG: ["SINGAPURA", "SINGAPORE"],
  ST: ["SAO TOME"],
  SV: ["SALVADOR"],
  US: ["EUA", "USA", "ESTADOS UNIDOS"],
  VA: ["VATICANO", "VATICAN", "SANTA SE"],
  BR: ["BRASIL", "BRAZIL"],
  CA: ["CANADA"],
  ES: ["ESPANHA", "SPAIN"],
  FR: ["FRANCA", "FRANCE"],
  PT: ["PORTUGAL"],
  CL: ["CHILE"],
  AR: ["ARGENTINA"],
  BO: ["BOLIVIA"],
  PY: ["PARAGUAI", "PARAGUAY"],
  UY: ["URUGUAI", "URUGUAY"],
  VE: ["VENEZUELA"],
  CO: ["COLOMBIA"],
  CR: ["COSTA RICA"],
  GT: ["GUATEMALA"],
  GE: ["GEORGIA"],
};
const nomesPorIso = new Map<string, Set<string>>();
for (const [iso, nome] of Object.entries(PAIS_NOME_POR_ISO2)) nomesPorIso.set(iso, new Set([norm(nome)]));
for (const [iso, vs] of Object.entries(VARIANTES)) {
  const s = nomesPorIso.get(iso) ?? new Set<string>();
  for (const v of vs) s.add(norm(v));
  nomesPorIso.set(iso, s);
}
const contemPalavras = (txt: string, termo: string) => ` ${txt} `.includes(` ${termo} `);
const revisaoHeuristica: string[] = [];
for (const cd of universo) {
  const nm = norm(nomeDe(cd));
  const escolhido = CIDADE_PAIS[cd]?.iso2;
  for (const [iso, termos] of nomesPorIso) {
    for (const t of termos) {
      if (t.length < 4 || !contemPalavras(nm, t)) continue;
      if (iso === escolhido) continue;
      // nome contém um país — aceito só se esse mesmo nome também é variante do país escolhido
      if (escolhido && nomesPorIso.get(escolhido)?.has(t)) continue;
      revisaoHeuristica.push(`${cd} ${nomeDe(cd)} → ${escolhido} (${CIDADE_PAIS[cd]?.pais}), mas o nome contém "${t}" (${iso})`);
    }
  }
}
// Casos já revisados e aceitos (código|termo). Qualquer acerto novo da heurística vira erro.
const ACEITOS_HEURISTICA = new Map<string, string>([
  ["29793|HONG KONG", "Hong Kong agregado em China (decisão editorial)"],
  ["30325|SPAIN", "Port of Spain é a capital de Trinidad e Tobago"],
]);
const heuristicaAceita: string[] = [];
for (const linha of revisaoHeuristica) {
  const cd = linha.slice(0, 5);
  const termo = /"([^"]+)"/.exec(linha)?.[1] ?? "";
  const motivo = ACEITOS_HEURISTICA.get(`${cd}|${termo}`);
  if (motivo) heuristicaAceita.push(`${linha} — aceito: ${motivo}`);
  else erros.push(`heurística: ${linha}`);
}

// ---------------------------------------------------------------------------
// 5) Homônimos de municípios brasileiros (só informativo)
// ---------------------------------------------------------------------------
let homonimosBR: string[] = [];
try {
  const mun = lerJson<MunicipioTuple[]>("public/data/municipios.json");
  const nomesBR = new Map<string, string[]>();
  for (const [, nome, uf] of mun) {
    if (uf === "zz") continue;
    const k = norm(nome);
    nomesBR.set(k, [...(nomesBR.get(k) ?? []), uf.toUpperCase()]);
  }
  homonimosBR = [...universo]
    .filter((cd) => nomesBR.has(norm(nomeDe(cd))))
    .map((cd) => `${cd} ${nomeDe(cd)} → ${CIDADE_PAIS[cd]?.pais} (homônimo no Brasil: ${nomesBR.get(norm(nomeDe(cd)))!.join(", ")})`);
} catch {
  avisos.push("public/data/municipios.json ausente — checagem de homônimos BR pulada");
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------
const paises = listaPaises();
const histPais = histPorPais(hist);
const fmt = new Intl.NumberFormat("pt-BR");
console.log(`Cidades 2026 (zz): ${codigos2026.length} | códigos no histórico: ${codigosHist.length} | só no histórico: ${soHist.map((c) => `${c} ${nomeDe(c)}`).join(", ") || "—"}`);
console.log(`Códigos mapeados: ${Object.keys(CIDADE_PAIS).length} | países: ${paises.length} | países com seção em 2026: ${new Set(codigos2026.map((c) => CIDADE_PAIS[c]?.pais)).size}\n`);

const linhas = paises
  .map((p) => {
    const cds = cidadesDoPais(p);
    const n26 = cds.filter((c) => nome2026.has(c)).length;
    const ap22 = histPais[p]?.["2022"]?.["1"]?.ap ?? 0;
    return { p, iso: isoDoPais.get(p)!, cds, n26, ap22 };
  })
  .sort((a, b) => b.cds.length - a.cds.length || b.ap22 - a.ap22 || a.p.localeCompare(b.p, "pt-BR"));
console.log("PAÍS                              ISO  CID  CID26  APTOS 2022  CIDADES");
for (const l of linhas) {
  console.log(
    `${l.p.padEnd(34)}${l.iso.padEnd(5)}${String(l.cds.length).padStart(3)}${String(l.n26).padStart(7)}${fmt.format(l.ap22).padStart(12)}  ${l.cds.map(nomeDe).join(", ")}`,
  );
}

console.log(`\nREVISÃO MANUAL — homônimos/ambíguos (${HOMONIMOS.length}):`);
for (const h of HOMONIMOS) {
  const cd = cdPorNome.get(norm(h.nome));
  console.log(`  ${cd ?? "?????"} ${h.nome.padEnd(24)} → ${h.esperado}  (alt.: ${h.alternativa}) — ${h.motivo}`);
}
console.log(`\nHeurística "nome contém outro país" — revisados (${heuristicaAceita.length}):`);
for (const l of heuristicaAceita) console.log(`  ${l}`);
console.log(`\nHomônimos de municípios brasileiros (${homonimosBR.length}):`);
for (const l of homonimosBR) console.log(`  ${l}`);

if (avisos.length) {
  console.log(`\nAVISOS (${avisos.length}):`);
  for (const a of avisos) console.log(`  ! ${a}`);
}
if (erros.length) {
  console.log(`\nERROS (${erros.length}):`);
  for (const e of erros) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nOK — todas as cidades do exterior (2026 + histórico) mapeadas.");
