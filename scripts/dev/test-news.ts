// Testes do módulo "Boletins da imprensa".
//   npx tsx scripts/dev/test-news.ts            → testes unitários + rodada ao vivo
//   npx tsx scripts/dev/test-news.ts --unit     → só testes unitários
//   npx tsx scripts/dev/test-news.ts --live     → só rodada ao vivo
import { readFileSync } from "node:fs";
import path from "node:path";
import { classificarBoletim, parseBoletim } from "../../src/lib/news/parse";
import type { BlocoId, MunicipioTuple, NumerosBoletim, TipoBoletim } from "../../src/lib/types";

const args = new Set(process.argv.slice(2));
const rodarUnit = !args.has("--live");
const rodarLive = !args.has("--unit");

let municipios: MunicipioTuple[] = [];
try {
  municipios = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/municipios.json"), "utf8"));
} catch {
  console.warn("! public/data/municipios.json ausente — testes de município serão pulados");
}

/**
 * esc: "br" | "uf:sp" | "mun:Nome/uf" | "pais:Japão" (cidade do exterior: "mun:Tóquio/zz")
 * números/venc: valor esperado; null = deve estar ausente; undefined = não verificar
 */
interface Caso {
  t: string;
  tipo?: TipoBoletim;
  apur?: number | null;
  pt?: number | null;
  bolso?: number | null;
  esc?: string;
  /** vencedor segundo o boletim */
  venc?: BlocoId | null;
}

const CASOS: Caso[] = [
  // --- apuração, nacional ---
  { t: "Com 45,3% das urnas apuradas, Lula tem 47,2% e Flávio Bolsonaro, 43,1%", tipo: "apuracao", apur: 45.3, pt: 47.2, bolso: 43.1, esc: "br" },
  { t: "Apuração em 62%: Lula (PT) 48,1% x Flávio (PL) 44,9% - CNN Brasil", tipo: "apuracao", apur: 62, pt: 48.1, bolso: 44.9, esc: "br" },
  { t: "Flávio Bolsonaro lidera com 46,8%; Lula tem 45,9% com 30% das seções totalizadas", tipo: "apuracao", apur: 30, pt: 45.9, bolso: 46.8, esc: "br" },
  { t: "Lula: 47,2%; Flávio: 43,1% — 50% das urnas apuradas", tipo: "apuracao", apur: 50, pt: 47.2, bolso: 43.1 },
  { t: "Eleições 2026: com 100% das urnas, Lula tem 48,4% e vai ao 2º turno com Flávio (43,2%)", tipo: "apuracao", apur: 100, pt: 48.4, bolso: 43.2, esc: "br" },
  { t: "Apuração chega a 90%; Lula soma 47.85% contra 44.10% de Flávio", tipo: "apuracao", apur: 90, pt: 47.85, bolso: 44.1 },
  { t: "TSE divulga parcial: 47,2% para Lula e 43,1% para Flávio Bolsonaro, com 12% apurado", tipo: "apuracao", apur: 12, pt: 47.2, bolso: 43.1 },
  { t: "Lula 47,2% x 43,1% Flávio — 33% das urnas apuradas", tipo: "apuracao", apur: 33, pt: 47.2, bolso: 43.1 },
  { t: "Apuração em 45%: Lula, 47,2%; Flávio, 43,1%", tipo: "apuracao", apur: 45, pt: 47.2, bolso: 43.1 },
  { t: "Com 45% dos votos apurados, Flávio tem 46% e Lula aparece com 45,5%", tipo: "apuracao", apur: 45, pt: 45.5, bolso: 46 },
  { t: "Lula tem 47% dos votos apurados até agora no TSE", pt: 47, apur: null },
  { t: "Lula tem 45.123.456 votos (47,2%) e Flávio 41.000.000 (43,1%)", pt: 47.2, bolso: 43.1 },
  { t: "Lula soma 52 milhões de votos; Flávio tem 48 milhões", pt: null, bolso: null, apur: null },
  { t: "Lula tem vantagem de 4,3 pontos sobre Flávio com 60% apurado", apur: 60, pt: null, bolso: null },
  { t: "Lula abre vantagem de 3% sobre Flávio Bolsonaro na apuração", pt: null, bolso: null },
  { t: "Abstenção chega a 20%; Lula tem 48% com 50% apurado", apur: 50, pt: 48, bolso: null },
  { t: "LULA TEM 48% E FLÁVIO 44% COM 55% DAS URNAS APURADAS EM MINAS GERAIS", tipo: "apuracao", apur: 55, pt: 48, bolso: 44, esc: "uf:mg" },
  { t: "Flávio Bolsonaro tem 43,1% dos votos válidos, contra 47,2% do petista", bolso: 43.1, pt: 47.2 },
  { t: "Lula vence com 50,8% dos votos válidos e é reeleito no 1º turno; Flávio tem 41,2%", tipo: "apuracao", pt: 50.8, bolso: 41.2 },
  // --- estados ---
  { t: "Em São Paulo, Flávio tem 52,3% e Lula, 38,1%, com 70% das urnas apuradas", apur: 70, pt: 38.1, bolso: 52.3, esc: "uf:sp" },
  { t: "Apuração no Rio Grande do Sul: Flávio Bolsonaro tem 55% e Lula 37%", tipo: "apuracao", pt: 37, bolso: 55, esc: "uf:rs" },
  { t: "Na Bahia, Lula lidera com 70,2% dos votos válidos com 80% apurado", apur: 80, pt: 70.2, esc: "uf:ba" },
  { t: "Flávio vence no RJ com 51%; Lula tem 42%", pt: 42, bolso: 51, esc: "uf:rj" },
  { t: "Com 98% das seções totalizadas no DF, Flávio tem 55,6%", apur: 98, bolso: 55.6, esc: "uf:df" },
  { t: "Paraná: Flávio Bolsonaro tem 61% com 90% das urnas apuradas", apur: 90, bolso: 61, esc: "uf:pr" },
  { t: "Rio de Janeiro: Flávio Bolsonaro tem 58% com 40% apurado", apur: 40, bolso: 58, esc: "uf:rj" },
  { t: "SP: Flávio 50,1%, Lula 41,7% (60% das urnas apuradas)", apur: 60, pt: 41.7, bolso: 50.1, esc: "uf:sp" },
  { t: "Ratinho Júnior tem 60% no Paraná, com 80% das urnas apuradas", apur: 80, pt: null, bolso: null, esc: "uf:pr" },
  { t: "Votação no Pará: Lula vence em Belém com 58%", pt: 58, esc: "mun:Belém/pa" },
  { t: "Votos para presidente: Lula tem 47% para presidente no país", pt: 47, esc: "br" },
  // --- municípios ---
  { t: "Em Campinas, Lula tem 41% e Flávio, 50%, com 60% das urnas apuradas", apur: 60, pt: 41, bolso: 50, esc: "mun:Campinas/sp" },
  { t: "Na capital paulista, Lula tem 49% contra 42% de Flávio", pt: 49, bolso: 42, esc: "mun:São Paulo/sp" },
  { t: "Cidade de São Paulo: Lula tem 49%; Flávio, 42%", pt: 49, bolso: 42, esc: "mun:São Paulo/sp" },
  { t: "Apuração em Belo Horizonte: Lula 44%, Flávio 47%", tipo: "apuracao", pt: 44, bolso: 47, esc: "mun:Belo Horizonte/mg" },
  { t: "Lula vence em Bom Jesus (PI) com 80% dos votos", pt: 80, esc: "mun:Bom Jesus/pi" },
  { t: "Na cidade do Rio, Flávio tem 55% e Lula 38%", pt: 38, bolso: 55, esc: "mun:Rio de Janeiro/rj" },
  { t: "Lula tem 48% em Natal com 70% das urnas apuradas", apur: 70, pt: 48, esc: "mun:Natal/rn" },
  // escopo = lugar da oração do 1º número: os 70% são de PE (os 60% da capital ficam de fora)
  { t: "Em Pernambuco, Lula tem 70%; na capital, 60%", pt: 70, esc: "uf:pe" },
  { t: "Em Pernambuco, Lula tem 60% na capital", pt: 60, esc: "mun:Recife/pe" },
  { t: "Lula vota em São Bernardo do Campo #Shorts", tipo: "outro", pt: null, bolso: null, esc: "mun:São Bernardo do Campo/sp" },
  // --- pesquisas ---
  { t: "Datafolha: Lula tem 45% e Flávio Bolsonaro, 42% em votos válidos, em empate técnico na véspera do 1º turno", tipo: "pesquisa", pt: 45, bolso: 42, apur: null, esc: "br" },
  { t: "Datafolha, 1º turno - votos válidos: Lula, 45%; Flávio Bolsonaro, 42%; Caiado, 4%; Renan, 3%; Cury, 3%; Zema, 1%", tipo: "pesquisa", pt: 45, bolso: 42 },
  { t: "Pesquisa Atlas: Lula tem 47% dos votos válidos contra 44,1% de Flávio Bolsonaro no 1º turno", tipo: "pesquisa", pt: 47, bolso: 44.1 },
  { t: "Flávio tem 50,2% e Lula, 47,4% em 2º turno em MG, diz AtlasIntel", tipo: "pesquisa", pt: 47.4, bolso: 50.2, esc: "uf:mg" },
  { t: "Quaest: Lula (46%) e Flávio Bolsonaro (45%) têm empate técnico em votos válidos", tipo: "pesquisa", pt: 46, bolso: 45 },
  { t: "Datafolha para presidente em PE, votos válidos: Lula, 65%; Flávio Bolsonaro, 26%; Cury, 3%", tipo: "pesquisa", pt: 65, bolso: 26, esc: "uf:pe" },
  { t: "Lula tem 54,8% e Flávio 45,2% em 2º turno no PA, diz pesquisa", tipo: "pesquisa", pt: 54.8, bolso: 45.2, esc: "uf:pa" },
  { t: "Aprovação do governo Lula é de 35%, diz Datafolha", tipo: "pesquisa", pt: null },
  { t: "Lula é aprovado por 35% e rejeitado por 52% dos eleitores", pt: null },
  // --- boca de urna ---
  { t: "Boca de urna Ipec: Lula tem 49% e Flávio, 44% dos votos válidos", tipo: "boca-de-urna", pt: 49, bolso: 44 },
  { t: "Pesquisa de boca de urna aponta Bolsonaro com 45% e Lula com 47%", tipo: "boca-de-urna", pt: 47, bolso: 45 },
  // --- governadores / outros nomes ---
  { t: "Em SP, Tarcísio tem 55,2% para governador; Lula tem 40% para presidente", pt: 40, bolso: null, esc: "uf:sp" },
  { t: "Com 50% das urnas apuradas, Haddad tem 35% e Tarcísio 52% em SP", apur: 50, pt: null, bolso: null, esc: "uf:sp" },
  { t: "Caiado tem 4%, Zema 1% e Ciro 2%; Lula lidera com 46%", pt: 46, bolso: null },
  { t: "Flávio Dino diz que apuração é segura; Lula tem 47%", pt: 47, bolso: null },
  { t: "Rayssa Furlan tem 25,3% e Randolfe, 19,9%, na disputa pelo Senado no AP", pt: null, bolso: null, esc: "uf:ap" },
  // --- Jair ≠ Flávio ---
  { t: "Jair Bolsonaro acompanha apuração e diz confiar na vitória de Flávio", pt: null, bolso: null },
  { t: "Em 2022, Bolsonaro teve 43,2% no 1º turno; agora Flávio tem 44,5% com 70% apurado", apur: 70, bolso: 44.5, pt: null },
  { t: "Lula tem 47,9% com 85% das urnas apuradas; em 2022, ele tinha 48,4% e Bolsonaro, 43,2%", apur: 85, pt: 47.9, bolso: null },
  { t: "Ex-presidente Bolsonaro, que teve 49,1% no 2º turno de 2022, acompanha apuração", bolso: null },
  { t: "Apuração: Bolsonaro tem 44% e Lula 47% com 20% das urnas", tipo: "apuracao", apur: 20, pt: 47, bolso: 44 },
  { t: "Lula tem 47% e Flávio 43%. Em 2018, Haddad teve 29,3% e Bolsonaro 46%", pt: 47, bolso: 43 },
  { t: "Lula tem 46,7% e Bolsonaro, 43,8%, aponta pesquisa", tipo: "pesquisa", pt: 46.7, bolso: null },
  // --- casos vistos nos feeds de 04/10/2026 ---
  { t: "Quaest no RN: Alysson Bezerra tem 37% dos votos válidos; Cadu de Lula, 32%; e Álvaro Dias, 29%", tipo: "pesquisa", pt: null, bolso: null, esc: "uf:rn" },
  { t: "Na espontânea de 1º turno da Quaest, Lula passa de 31% para 35% e Flávio vai de 27% para 32%", tipo: "pesquisa", pt: 35, bolso: 32 },
  { t: "Datafolha: no Sudeste, Flávio passa de 39% para 42% e Lula vai de 40% a 38%", pt: 38, bolso: 42 },
  { t: "Atlas PR: Flávio tem 52,7% dos votos válidos no 1º turno; Lula, 37,2%", tipo: "pesquisa", pt: 37.2, bolso: 52.7, esc: "uf:pr" },
  { t: "Futura: Flávio tem 44,8% dos votos válidos no 1º turno; Lula, 42,6%", tipo: "pesquisa", pt: 42.6, bolso: 44.8 },
  { t: "Lula vota em São Bernardo e diz estar confiante na vitória", esc: "mun:São Bernardo do Campo/sp" },
  { t: "Lula vota em São Bernardo (SP) ao lado de Janja e aliados", esc: "mun:São Bernardo do Campo/sp" },
  { t: "Augusto Cury vota no interior de SP", esc: "uf:sp" },
  { t: "Eleições 2026: Lula vence na Coreia do Sul com 56,94%; veja votação no exterior", tipo: "apuracao", pt: 56.94, bolso: null, esc: "pais:Coreia do Sul", venc: "pt" },
  { t: "Qual é o número de Flávio Roscoe para o governo de Minas Gerais?", pt: null, bolso: null, esc: "uf:mg" },
  { t: "AtlasIntel: Eduardo Riedel tem 50,5% contra 30,1% de Fábio Trad em MS", pt: null, bolso: null, esc: "uf:ms" },
  // --- outros / exterior ---
  { t: "Eleições: 99,93% das urnas operam sem falhas até as 10h", apur: null, pt: null, bolso: null },
  { t: "Lula e Flávio Bolsonaro votam na manhã deste domingo", tipo: "outro", pt: null, bolso: null, esc: "br" },
  { t: "Lula vence na China e na Austrália; Flávio leva as Filipinas", tipo: "apuracao", esc: "pais:China", venc: "pt" },
  { t: "Flávio Bolsonaro sai na frente nas eleições no exterior após votação ser encerrada na Ásia", tipo: "apuracao", esc: "uf:zz" },
  { t: "Que horas começa a sair o resultado do primeiro turno das eleições?", tipo: "apuracao", pt: null },
  { t: "Famosos votam no 1º turno das eleições de 2026; FOTOS", tipo: "outro", esc: "br" },
];

/** Casos adversariais da revisão (04/10/2026): formatos, outros cargos, Jair × Flávio, faixas, escopo. */
const CASOS_REVISAO: Caso[] = [
  // --- formatos de apuração ---
  { t: "Flávio Bolsonaro tem 41,2% e Lula 46,9% com 38% das seções", tipo: "apuracao", apur: 38, pt: 46.9, bolso: 41.2, esc: "br" },
  { t: "Lula 48%, Flávio 45% — 90% apurado", tipo: "apuracao", apur: 90, pt: 48, bolso: 45, esc: "br" },
  { t: "Com 45% das seções eleitorais totalizadas, Lula tem 47,5% e Flávio, 44%", tipo: "apuracao", apur: 45, pt: 47.5, bolso: 44 },
  { t: "Com 30% das urnas eletrônicas apuradas, Flávio tem 46% e Lula 45%", tipo: "apuracao", apur: 30, pt: 45, bolso: 46 },
  { t: "Lula tem 47.2% e Flávio 43.9% com 61.5% das urnas apuradas", tipo: "apuracao", apur: 61.5, pt: 47.2, bolso: 43.9 },
  { t: "Lula tem 47 % e Flávio 44 %, com 52 % das urnas apuradas", apur: 52, pt: 47, bolso: 44 },
  { t: "47,2% Lula x 43,1% Flávio, com 70% das urnas apuradas", apur: 70, pt: 47.2, bolso: 43.1 },
  { t: "Lula 48% x 46% Flávio, diz Quaest", tipo: "pesquisa", pt: 48, bolso: 46 },
  { t: "Com 12,5% das urnas apuradas no Brasil, Lula aparece à frente com 49,1%, seguido por Flávio Bolsonaro, com 42,3%", tipo: "apuracao", apur: 12.5, pt: 49.1, bolso: 42.3, esc: "br" },
  { t: "Lula (PT) – 47,2%; Flávio Bolsonaro (PL) – 43,1%; apuradas: 50%", apur: 50, pt: 47.2, bolso: 43.1 },
  { t: "Lula: 47,25%. Flávio: 44,10%. Apurado: 80,5%", apur: 80.5, pt: 47.25, bolso: 44.1 },
  { t: "Lula tem 48% dos votos válidos e Flávio, 44%; brancos e nulos somam 3%", pt: 48, bolso: 44 },
  { t: "Comparecimento é de 79%; Lula tem 47% e Flávio 45%", pt: 47, bolso: 45, apur: null },
  { t: "Abstenção chega a 21,3%, a maior desde 1998, com 85% das urnas apuradas", apur: 85, pt: null, bolso: null },
  { t: "Lula tem 47,3% contra 48,4% em 2022; Flávio tem 44% ante 43,2% do pai", pt: 47.3, bolso: 44 },
  { t: "Lula é eleito com 50,9% dos votos válidos", tipo: "apuracao", pt: 50.9, bolso: null },
  { t: "Lula ganha em 70% dos municípios do Nordeste", pt: null, bolso: null },
  { t: "Flávio vence em 60% das cidades de SP; Lula vence nas capitais", pt: null, bolso: null, esc: "uf:sp" },
  { t: "Lula tem entre 45% e 49% dos votos válidos, segundo projeção", pt: null },
  { t: "Lula diz que 100% das urnas são seguras", pt: null, apur: null },
  // --- pesquisas ---
  { t: "Quaest: Lula 41%, Flávio 37%", tipo: "pesquisa", pt: 41, bolso: 37, apur: null },
  { t: "Lula tem 46% e Flávio, 44%, mostra levantamento", tipo: "pesquisa", pt: 46, bolso: 44 },
  { t: "AtlasIntel/Bloomberg: Lula tem 48,1%; Flávio, 46,9%", tipo: "pesquisa", pt: 48.1, bolso: 46.9 },
  { t: "Paraná Pesquisas: Flávio tem 44,3% e Lula, 43,9%", tipo: "pesquisa", pt: 43.9, bolso: 44.3, esc: "br" },
  { t: "Datafolha: Lula 45%, Flávio 40%; brancos e nulos 6%; indecisos 3%", tipo: "pesquisa", pt: 45, bolso: 40 },
  { t: "Pesquisa Quaest para o governo de SP: Tarcísio tem 50% e Haddad 30%", tipo: "pesquisa", pt: null, bolso: null, esc: "uf:sp" },
  { t: "Lula tem 47% e Flávio 44%, diz Datafolha; em SP, Tarcísio lidera com 50%", tipo: "pesquisa", pt: 47, bolso: 44 },
  { t: "Ipespe: no 2º turno, Lula tem 49% e Flávio, 45%", tipo: "pesquisa", pt: 49, bolso: 45 },
  // --- boca de urna ---
  { t: "Boca de urna do Ipec: Lula 50%, Flávio 43%", tipo: "boca-de-urna", pt: 50, bolso: 43 },
  { t: "Boca de urna Quaest em SP: Flávio 51%, Lula 39%", tipo: "boca-de-urna", pt: 39, bolso: 51, esc: "uf:sp" },
  // --- outros cargos misturados ---
  { t: "Tarcísio tem 55% em SP", pt: null, bolso: null, esc: "uf:sp" },
  { t: "Com 80% apurado, Tarcísio tem 56% e Haddad 38%; para presidente, Flávio lidera em SP com 51%", apur: 80, pt: null, bolso: 51, esc: "uf:sp" },
  { t: "Jerônimo tem 52% na Bahia; Lula tem 72% no estado", pt: 72, esc: "uf:ba" },
  { t: "João Campos tem 60% em Pernambuco; Lula, 70%", pt: 70, bolso: null, esc: "uf:pe" },
  { t: "Simone Tebet, ministra de Lula, tem 3% dos votos", pt: null },
  { t: "Ciro Gomes, ex-aliado de Lula, aparece com 4%", pt: null },
  { t: "Flávio Dino vota em São Luís; Lula tem 48% com 20% apurado", apur: 20, pt: 48, bolso: null, esc: "mun:São Luís/ma" },
  // --- Jair ≠ Flávio ---
  { t: "Jair Bolsonaro vota no Rio", pt: null, bolso: null, esc: "uf:rj" },
  { t: "Michelle Bolsonaro vota em Brasília e diz que Flávio vence", bolso: null, esc: "mun:Brasília/df" },
  { t: "Bolsonaro, preso, não vota; Flávio tem 44% com 50% das urnas apuradas", apur: 50, bolso: 44, pt: null },
  { t: "Haddad teve 29,3% no 1º turno de 2018", pt: null, bolso: null },
  // --- escopo ---
  { t: "Em Pernambuco, Lula tem 68% com 40% das urnas apuradas", apur: 40, pt: 68, esc: "uf:pe" },
  { t: "No Paraná, Flávio lidera com 60%", bolso: 60, esc: "uf:pr" },
  { t: "Lula tem 45% em Campinas (SP)", pt: 45, esc: "mun:Campinas/sp" },
  { t: "Em Campinas (SP), Flávio tem 52%", bolso: 52, esc: "mun:Campinas/sp" },
  { t: "Lula tem 52% em Feira de Santana (BA) com 70% apurado", apur: 70, pt: 52, esc: "mun:Feira de Santana/ba" },
  { t: "Em Santo André, Lula tem 50%", pt: 50, esc: "mun:Santo André/sp" },
  { t: "Em São José dos Campos, Flávio tem 60%", bolso: 60, esc: "mun:São José dos Campos/sp" },
  { t: "Lula tem 47% e Flávio 44% no Nordeste", pt: 47, bolso: 44, esc: "br" },
  { t: "Em Minas, Lula tem 47%", pt: 47, esc: "uf:mg" },
  { t: "No Rio, Flávio tem 55%", bolso: 55, esc: "uf:rj" },
  { t: "Em Rio Branco, Lula tem 30%", pt: 30, esc: "mun:Rio Branco/ac" },
  { t: "Em Vitória (ES), Lula tem 40%", pt: 40, esc: "mun:Vitória/es" },
  { t: "Lula tem 45% no Mato Grosso do Sul", pt: 45, esc: "uf:ms" },
  { t: "Em Mato Grosso, Flávio tem 65%", bolso: 65, esc: "uf:mt" },
  { t: "Em Goiás, Flávio tem 58%", bolso: 58, esc: "uf:go" },
  { t: "No Tocantins, Lula tem 51%", pt: 51, esc: "uf:to" },
  { t: "Em Palmas, Flávio tem 50%", bolso: 50, esc: "mun:Palmas/to" },
  { t: "Lula vence em Portugal com 60%", pt: 60, esc: "pais:Portugal", venc: "pt" },
  { t: "No exterior, Flávio tem 55% com 90% apurado", apur: 90, bolso: 55, esc: "uf:zz" },
  { t: "Em Toledo (PR), Flávio tem 70%", bolso: 70, esc: "mun:Toledo/pr" },
  { t: "Em Porto Alegre, Flávio tem 52%", bolso: 52, esc: "mun:Porto Alegre/rs" },
  { t: "Lula lidera em Salvador e no interior da Bahia", esc: "mun:Salvador/ba" },
  { t: "Lula vence no Distrito Federal? Não: Flávio tem 58% no DF", bolso: 58, esc: "uf:df" },
  { t: "Em Santa Catarina, Flávio tem 68%; Lula, 25%", pt: 25, bolso: 68, esc: "uf:sc" },
  { t: "Para Lula, resultado em SP é positivo", esc: "uf:sp" },
  { t: "Lula tem 45% em São Paulo (SP)", pt: 45, esc: "mun:São Paulo/sp" },
  { t: "No Rio Grande do Norte, Lula tem 70%", pt: 70, esc: "uf:rn" },
  { t: "Em Sergipe, Lula tem 66%", pt: 66, esc: "uf:se" },
  { t: "Na Paraíba, Lula vence com 64%", pt: 64, esc: "uf:pb" },
  { t: "Em Londrina, Flávio tem 62% com 95% das urnas apuradas", apur: 95, bolso: 62, esc: "mun:Londrina/pr" },
  { t: "Apuração em Santos: Flávio 55%, Lula 38%", tipo: "apuracao", pt: 38, bolso: 55, esc: "mun:Santos/sp" },
  { t: "Lula tem 47% no Brasil; em Campinas, 40%", pt: 47, esc: "br" },
  // --- rodada 2 ---
  { t: "Lula tem 47%; Flávio, 44%. Em 2022, Lula teve 48,4% e Bolsonaro 43,2%", pt: 47, bolso: 44 },
  { t: "Em 2018, Haddad teve 29%; hoje Lula tem 47% com 60% apurado", apur: 60, pt: 47 },
  { t: "Lula supera votação de 2022 e chega a 49% com 80% das urnas apuradas", apur: 80, pt: 49 },
  { t: "Lula 47,2% vs. Flávio 43,1%", pt: 47.2, bolso: 43.1 },
  { t: "LULA 47,2% X FLÁVIO 43,1%", pt: 47.2, bolso: 43.1 },
  { t: "Lula (47,2%) e Flávio (43,1%) seguem para o 2º turno", tipo: "apuracao", pt: 47.2, bolso: 43.1 },
  { t: "Lula tem 47,2% contra 43,1% do candidato do PL", pt: 47.2, bolso: null },
  { t: "Flávio, filho de Bolsonaro, tem 44% e Lula 47% com 50% das urnas apuradas", apur: 50, pt: 47, bolso: 44 },
  { t: "Flávio, rival de Lula, tem 44%", bolso: 44, pt: null },
  { t: "Lula tem 44% dos votos totais e 47% dos válidos", pt: 44 },
  { t: "Flávio tem 44% entre evangélicos; Lula, 62% entre católicos, diz Datafolha", tipo: "pesquisa" },
  { t: "Em BH, Lula tem 44%", pt: 44, esc: "mun:Belo Horizonte/mg" },
  { t: "Lula tem 48% no RS e Flávio, 46%", pt: 48, bolso: 46, esc: "uf:rs" },
  { t: "Flávio vence no Acre com 70%", bolso: 70, esc: "uf:ac" },
  { t: "Lula vence em Alagoas com 60%", pt: 60, esc: "uf:al" },
  { t: "Pará: Lula tem 60% com 50% das urnas apuradas", apur: 50, pt: 60, esc: "uf:pa" },
  { t: "Lula tem 55% no Pará", pt: 55, esc: "uf:pa" },
  { t: "Para o Pará, Lula tem 55%", pt: 55, esc: "uf:pa" },
  { t: "Votos para Lula somam 47% e para Flávio, 44%", pt: 47, bolso: 44 },
  { t: "Apuração: 47% para Lula, 44% para Flávio e 3% para Ciro; 50% das urnas", apur: 50, pt: 47, bolso: 44 },
  { t: "Lula lidera com 49,8% e pode vencer no 1º turno; Flávio soma 41,5%", pt: 49.8, bolso: 41.5 },
  { t: "Faltando 10% das urnas, Lula tem 48%", pt: 48, apur: 90 },
  { t: "Com 9 em cada 10 urnas apuradas, Lula tem 48%", pt: 48 },
  { t: "Lula tem 47,9% dos votos válidos; abstenção é de 20%, e votos brancos, 2%", pt: 47.9, bolso: null },
  { t: "Lula 47% Flávio 44% Ciro 4% Tebet 2%", pt: 47, bolso: 44 },
  { t: "Ciro 4%, Tebet 2%, Flávio 44%, Lula 47%", pt: 47, bolso: 44 },
  { t: "Datafolha mostra Lula com 45% e Flávio com 42% em SP", tipo: "pesquisa", pt: 45, bolso: 42, esc: "uf:sp" },
  { t: "Em Campinas, no interior de SP, Lula tem 41%", pt: 41, esc: "mun:Campinas/sp" },
  { t: "Lula tem 52% em Petrolina (PE) e 61% em Juazeiro (BA)", pt: 52, esc: "mun:Petrolina/pe" },
  { t: "Em Recife, Lula tem 66% com 80% apurado", apur: 80, pt: 66, esc: "mun:Recife/pe" },
  { t: "Em Fortaleza, Lula tem 58%; no Ceará, 70%", pt: 58, esc: "mun:Fortaleza/ce" },
  { t: "No Ceará, Lula tem 70%; em Fortaleza, 58%", pt: 70, esc: "uf:ce" },
  { t: "Lula tem 70% no Ceará", pt: 70, esc: "uf:ce" },
  { t: "Na Grande São Paulo, Flávio tem 48%", bolso: 48, esc: "uf:sp" },
  { t: "No Amazonas, Lula tem 55%", pt: 55, esc: "uf:am" },
  { t: "Em Manaus, Flávio tem 52%", bolso: 52, esc: "mun:Manaus/am" },
  { t: "Lula vence em Lisboa com 65%", pt: 65, esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Lula tem 47%, segundo parcial do TSE às 19h", tipo: "apuracao", pt: 47 },
  { t: "Flávio Bolsonaro: 43,1% | Lula: 47,2% | Apuradas: 50%", apur: 50, pt: 47.2, bolso: 43.1 },
  { t: "Lula tem 47,2 por cento e Flávio 43,1 por cento", pt: 47.2, bolso: 43.1 },
  { t: "Lula é reeleito com 50,3%; Flávio fica com 42%", tipo: "apuracao", pt: 50.3, bolso: 42 },
  { t: "Bolsonaro diz que Flávio terá mais de 50% em SP", pt: null, esc: "uf:sp" },
  { t: "Eduardo Bolsonaro vota em São Paulo", bolso: null, esc: "uf:sp" },
  { t: "Lula: 13,5 milhões de votos em SP (38%)", pt: 38, esc: "uf:sp" },
  // --- rodada 3 (vistos ao vivo / classificação) ---
  { t: "Redes: Haddad é Lula em 80% dos posts; Tarcísio faz campanha solo e cita Flávio em 1%", pt: null, bolso: null },
  { t: "CNT/MDA: Lula é desaprovado por 49,2%; aprovação é de 47,4%", tipo: "pesquisa", pt: null, bolso: null },
  { t: "PMDF registra três denúncias de boca de urna; casos serão apurados", tipo: "outro", apur: null },
  { t: "PF prende 12 pessoas por boca de urna em SP", tipo: "outro", esc: "uf:sp" },
  { t: "Lula vota em São Bernardo do Campo e diz que irá propor reforma no STF caso seja reeleito", tipo: "outro" },
  { t: "Lula é reeleito presidente com 50,3% dos votos válidos", tipo: "apuracao", pt: 50.3 },
  { t: "Lula tem 60% da Bahia, segundo parcial", pt: 60 },
  { t: "Flávio tem 44% do total de votos apurados até agora", bolso: 44, apur: null },
  { t: "Lula tem 61,6% das intenções de voto na Bahia, diz AtlasIntel", tipo: "pesquisa", pt: 61.6, esc: "uf:ba" },
  { t: "Votos serão apurados a partir das 17h; Lula e Flávio aguardam", tipo: "outro" },
  // --- rodada 4 (siglas soltas / modelos por cidade) ---
  { t: "Apuração de votos para Presidente Santana de Parnaíba SP no Primeiro Turno | Eleições 2026", tipo: "apuracao", esc: "mun:Santana de Parnaíba/sp" },
  { t: "Apuração de votos para Presidente SP no Primeiro Turno - Eleições 2026", esc: "uf:sp" },
  { t: "Flávio Bolsonaro (PL-RJ) chegou acompanhado da esposa à escola", esc: "br" },
  { t: "Lula tem 41% em Campinas-SP com 30% apurado", apur: 30, pt: 41, esc: "mun:Campinas/sp" },
  { t: "Lula tem 41% em Campinas/SP", pt: 41, esc: "mun:Campinas/sp" },
  { t: "Votação em Juiz de Fora, MG, tem filas; Lula tem 45%", pt: 45, esc: "mun:Juiz de Fora/mg" },
  { t: "LULA TEM 48% E SE MANTÉM NA FRENTE", pt: 48, esc: "br" },
  { t: "Datafolha SP: Flávio 45%, Lula 39%", tipo: "pesquisa", pt: 39, bolso: 45, esc: "uf:sp" },
  { t: "Flávio tem 52% em Toledo PR", bolso: 52, esc: "mun:Toledo/pr" },
  // --- "o petista" = Lula (só quando nenhum outro petista é citado) ---
  { t: "Com 99,9% apurado, o petista tem 48,4% e Flávio, 43,2%; Lula vai ao 2º turno", apur: 99.9, pt: 48.4, bolso: 43.2 },
  { t: "Haddad, o petista, tem 30% em SP; Lula lidera no país", pt: null },
  { t: "O petista Jerônimo tem 52% na Bahia; Lula, 70%", pt: 70, esc: "uf:ba" },
  { t: "Lula e Flávio vão ao 2º turno; o petista teve 48,4% e Flávio, 43,2%", tipo: "apuracao", pt: 48.4, bolso: 43.2 },
  { t: "Samara tem 1% e Hertz Dias, 0,5%; Lula lidera com 47%", pt: 47, bolso: null },
  { t: "Lula tem 47,2% contra 43,1% do senador Flávio Bolsonaro", pt: 47.2, bolso: 43.1 },
  { t: "Parcial: 47% do presidente Lula e 44% de Flávio", pt: 47, bolso: 44 },
  // --- boletins típicos da noite de apuração ---
  { t: "Apuração 2026: com 1,02% das seções totalizadas, Lula tem 48,13% e Flávio, 43,25%", tipo: "apuracao", apur: 1.02, pt: 48.13, bolso: 43.25, esc: "br" },
  { t: "Eleições 2026 AO VIVO: Lula lidera com 47,9% dos votos válidos; 25% das urnas apuradas", tipo: "apuracao", apur: 25, pt: 47.9 },
  { t: "TSE: com 50,01% das urnas apuradas, Flávio Bolsonaro (PL) tem 46,1% e Lula (PT), 45,7%", tipo: "apuracao", apur: 50.01, pt: 45.7, bolso: 46.1 },
  { t: "Resultado parcial: Lula 48,6% x Flávio 43,1% (75,2% apurado)", tipo: "apuracao", apur: 75.2, pt: 48.6, bolso: 43.1 },
  { t: "Parcial do TSE às 19h30: Lula 47%; Flávio 45%; 60% das seções apuradas", tipo: "apuracao", apur: 60, pt: 47, bolso: 45 },
  { t: "Primeiro boletim do TSE: Flávio 48,2%, Lula 44,9% com 0,5% das urnas", tipo: "apuracao", apur: 0.5, pt: 44.9, bolso: 48.2 },
  { t: "Com 2% das urnas apuradas em SP, Flávio tem 52%", apur: 2, bolso: 52, esc: "uf:sp" },
  { t: "Apuração em MG: Lula 46,2% x 45,9% Flávio; 80% apurado", tipo: "apuracao", apur: 80, pt: 46.2, bolso: 45.9, esc: "uf:mg" },
];

function fmtNum(n: number | undefined) {
  return n === undefined ? "—" : String(n);
}

/** Exterior (04/10/2026): países, cidades com seção eleitoral (uf "zz") e vencedor segundo o boletim. */
const CASOS_EXTERIOR: Caso[] = [
  // --- manchetes reais (Google Notícias, 04/10/2026) ---
  { t: "Lula vence na China e em mais cinco países; Flávio fica em 1º no Japão e em mais três", tipo: "apuracao", esc: "pais:China", venc: "pt" },
  { t: "Eleições 2026: Lula vence em Singapura", tipo: "apuracao", esc: "pais:Singapura", venc: "pt" },
  { t: "Eleições 2026: Flávio Bolsonaro fica na frente nas Filipinas", tipo: "apuracao", esc: "pais:Filipinas", venc: "bolso" },
  { t: "Eleições no exterior: Lula vence em seis países e Flávio em quatro", tipo: "apuracao", esc: "uf:zz", venc: null },
  { t: "Lula vence na Nova Zelândia com 70%", tipo: "apuracao", pt: 70, bolso: null, esc: "pais:Nova Zelândia", venc: "pt" },
  { t: "Primeiras urnas fecham no exterior; Lula lidera em 5 de 8 países", esc: "uf:zz", venc: null },
  { t: "Austrália, Nova Zelândia, Coreia do Sul e Malásia dão vitória a Lula; Flávio Bolsonaro vence nas Filipinas e Tailândia; acompanhe a apuração no exterior", tipo: "apuracao", esc: "pais:Austrália", venc: "pt" },
  { t: "Brasileiros já votaram em 8 países: Lula vence em 5 e Flávio, em 3", esc: "uf:zz", venc: null },
  { t: "Lula vence as eleições no exterior, confira os boletins de urna divulgados", tipo: "apuracao", esc: "uf:zz", venc: "pt" },
  { t: "Apuração no exterior: Lula vence em Singapura e na Malásia; Flávio nas Filipinas", tipo: "apuracao", esc: "pais:Singapura", venc: "pt" },
  { t: "Eleições no exterior: Lula vence Flávio Bolsonaro em 4 países", esc: "uf:zz", venc: null },
  { t: "Eleições 2026: Lula vence na Nova Zelândia, Coreia do Sul, Malásia, Cingapura e Austrália; Flávio ganha nas Filipinas e Tailândia", esc: "pais:Nova Zelândia", venc: "pt" },
  { t: "APURAÇÃO NO EXTERIOR: Lula vence com 70% na Nova Zelândia e 56% na Coréia do Sul", tipo: "apuracao", pt: 70, esc: "pais:Nova Zelândia", venc: "pt" },
  { t: "Eleições 2026: Lula vence na China; Flávio fica na frente em Hong Kong", esc: "pais:China", venc: "pt" },
  { t: "Flávio fica na frente em Hong Kong", esc: "mun:Hong Kong/zz", venc: "bolso" },
  { t: "Lula vence em todas as seções eleitorais da China continental", esc: "pais:China", venc: "pt" },
  { t: "VOTAÇÃO NO EXTERIOR: Lula vence Flávio Bolsonaro na Austrália e Nova Zelândia", tipo: "apuracao", esc: "pais:Austrália", venc: "pt" },
  { t: "Lula vence em quatro países e Flávio Bolsonaro lidera nas Filipinas em primeiros resultados de votação no exterior", esc: "pais:Filipinas", venc: "bolso" },
  { t: "VOTAÇÃO NO EXTERIOR: Flávio Bolsonaro vence Lula nas Filipinas", tipo: "apuracao", esc: "pais:Filipinas", venc: "bolso" },
  { t: "ELEIÇÕES 2026: LULA VENCE EM QUATRO PAÍSES E FLÁVIO BOLSONARO LEVA A MELHOR NAS FILIPINAS", tipo: "apuracao", esc: "pais:Filipinas", venc: "bolso" },
  { t: "Eleições 2026: Flávio Bolsonaro lidera no Japão", tipo: "apuracao", esc: "pais:Japão", venc: "bolso" },
  { t: "VOTAÇÃO NO EXTERIOR: Flávio Bolsonaro foi o mais votado pelos brasileiros no Japão com 73,4% dos votos válidos", bolso: 73.4, esc: "pais:Japão", venc: "bolso" },
  { t: "Lula lidera primeiros boletins no exterior; Flávio vence nas Filipinas e Tailândia", esc: "pais:Filipinas", venc: "bolso" },
  { t: "Votação no exterior: Flávio Bolsonaro vence Lula com mais de 27 mil votos", esc: "uf:zz", venc: "bolso" },
  { t: "Lula lidera em países da Ásia e Oceania, enquanto Flávio Bolsonaro vence no Japão e nas Filipinas", esc: "pais:Japão", venc: "bolso" },
  { t: "Primeiros boletins das urnas no exterior dão vantagem a Lula e Flávio vence em dois países; confira", esc: "uf:zz", venc: "pt" },
  { t: "Lula vence em 5 países e Flávio Bolsonaro nas Filipinas", esc: "pais:Filipinas", venc: "bolso" },
  { t: "Lula vence em seis países; Flávio leva Japão e avança pela Ásia", tipo: "apuracao", esc: "pais:Japão", venc: "bolso" },
  { t: "Lula larga na frente no exterior: Nova Zelândia, Coreia, China, Austrália e outros países divulgam primeiros resultados", esc: "pais:Nova Zelândia", venc: null },
  { t: "Votação no Exterior: Lula vence na maioria dos países da Àsia e Oceânia", esc: "uf:zz", venc: null },
  { t: "Lula x Flávio: veja quem venceu na China, Austrália, Filipinas, Japão e em outros países", esc: "pais:China", venc: null },
  { t: "Eleições 2026: Brasileiros votam no EUA em meio à tensão com ICE", esc: "pais:Estados Unidos", venc: null },
  { t: "Lula vence na Austrália; Augusto Cury fica em 3º", esc: "pais:Austrália", venc: "pt" },
  { t: "Flávio Bolsonaro sai na frente nas eleições no exterior após votação ser encerrada na Ásia", esc: "uf:zz", venc: "bolso" },
  { t: "Lula lidera apuração em países da Ásia e Oceania; Flávio Bolsonaro aparece à frente em parte dos territórios", esc: "uf:zz", venc: null },
  { t: "Lula vence em cinco países e Flávio Bolsonaro leva dois no voto do exterior", esc: "uf:zz", venc: null },
  { t: "Flávio vence Lula com larga margem no exterior", esc: "uf:zz", venc: "bolso" },
  { t: "Lula vence na China, Roma, Rússia, Austrália e Coreia do Sul", esc: "pais:China", venc: "pt" },
  { t: "Flávio Bolsonaro lidera no Japão e vence nas Filipinas; veja os números", esc: "pais:Japão", venc: "bolso" },
  { t: "FLÁVIO BOLSONARO LIDERA NO EXTERIOR E ABRE MAIS DE 16 MIL VOTOS SOBRE LULA", esc: "uf:zz", venc: "bolso" },
  { t: "Lula vence em países da Ásia e Oceania no voto brasileiro no exterior", esc: "uf:zz", venc: null },
  { t: "Lula lidera na Nova Zelândia e Flávio Bolsonaro no Japão: Veja em quem brasileiros votaram no exterior", esc: "pais:Nova Zelândia", venc: "pt" },
  { t: "Lula vence na China e Flávio vence no Japão", esc: "pais:China", venc: "pt" },
  { t: "Brasil já oferece resultados no exterior: Lula se impõe na Austrália e Flávio Bolsonaro no Japão", esc: "pais:Austrália", venc: "pt" },
  { t: "Em Tóquio, Flávio Bolsonaro tem mais que o dobro dos votos de Lula", esc: "mun:Tóquio/zz", venc: "bolso" },
  { t: "Flávio abre vantagem sobre Lula e vence no Japão, Filipinas, Tailândia, Hong Kong e Taiwan", esc: "pais:Japão", venc: "bolso" },
  { t: "Flávio Bolsonaro supera Lula na eleição nas Filipinas, no Japão e na Tailândia, com diferença de quase 10 mil votos", esc: "pais:Filipinas", venc: "bolso" },
  { t: "Austrália, Nova Zelândia, China, Japão, entre outros: veja a votação de Lula e Flávio no exterior", esc: "pais:Austrália", venc: null },
  { t: "Imprensa internacional repercute eleição presidencial no Brasil: futuro da América Latina", esc: "br", venc: null },
  { t: "Interesse dos EUA nas eleições domina disputa entre Lula e Flávio", esc: "br", venc: null },
  { t: "Bósnia vota em eleição que pode destravar entrada na União Europeia", esc: "br", venc: null },
  { t: "Eleitores do Japão dão vitória a Flávio", esc: "pais:Japão", venc: "bolso" },
  // --- apelidos de país ---
  { t: "Lula vence nos EUA com 52%", pt: 52, esc: "pais:Estados Unidos", venc: "pt" },
  { t: "Flávio vence na Holanda", esc: "pais:Países Baixos", venc: "bolso" },
  { t: "Lula ganha na Inglaterra e na Irlanda", esc: "pais:Reino Unido", venc: "pt" },
  { t: "Flávio lidera na Coreia; Lula vence no Japão", esc: "pais:Coreia do Sul", venc: "bolso" },
  { t: "Lula vence nos Estados Unidos e no Canadá", esc: "pais:Estados Unidos", venc: "pt" },
  { t: "Flávio lidera em Portugal com 52% dos votos válidos", bolso: 52, esc: "pais:Portugal", venc: "bolso" },
  { t: "Na Itália, Flávio vence com 55%", bolso: 55, esc: "pais:Itália", venc: "bolso" },
  { t: "Japão: Flávio Bolsonaro tem 73% e Lula, 20%", bolso: 73, pt: 20, esc: "pais:Japão" },
  { t: "Vitória de Lula na Argentina e no Paraguai", esc: "pais:Argentina", venc: "pt" },
  { t: "Lula perde para Flávio no Paraguai", esc: "pais:Paraguai", venc: "bolso" },
  { t: "Brasileiros na Alemanha escolhem Lula", esc: "pais:Alemanha", venc: "pt" },
  // --- cidades do exterior ---
  { t: "Flávio vence em Tóquio com 70%", bolso: 70, esc: "mun:Tóquio/zz", venc: "bolso" },
  { t: "Flávio vence em Nagóia e Hamamatsu", esc: "mun:Nagóia/zz", venc: "bolso" },
  { t: "Lula vence em Paris", esc: "mun:Paris/zz", venc: "pt" },
  { t: "Lula lidera em Miami? Não: Flávio tem 70% na cidade", bolso: 70, esc: "mun:Miami/zz", venc: null },
  { t: "Lula vence no Japão, em Tóquio, mas perde em Hamamatsu", esc: "mun:Tóquio/zz", venc: "pt" },
  { t: "Flávio vence em Nova York; Lula leva Boston", esc: "mun:Nova York/zz", venc: "bolso" },
  { t: "Eleições no exterior: Lula vence em Santiago, no Chile", esc: "mun:Santiago/zz", venc: "pt" },
  { t: "Eleições no exterior: Lula vence em Rio Branco (Uruguai)", esc: "mun:Rio Branco/zz", venc: "pt" },
  { t: "Lula vence na Cidade do Cabo", esc: "mun:Cidade do Cabo/zz", venc: "pt" },
  // --- o Brasil continua valendo (homônimos e falsos positivos) ---
  { t: "Lula vence em Holambra com 40%", pt: 40, esc: "mun:Holambra/sp", venc: "pt" },
  { t: "Flávio vence em Japeri com 55%", bolso: 55, esc: "mun:Japeri/rj", venc: "bolso" },
  { t: "Em Rio Branco, Lula tem 30%", pt: 30, esc: "mun:Rio Branco/ac" },
  { t: "Lula vence em Rio Branco", esc: "mun:Rio Branco/ac", venc: "pt" },
  { t: "Flávio vence em Santa Cruz do Sul com 60%", bolso: 60, esc: "mun:Santa Cruz do Sul/rs", venc: "bolso" },
  { t: "Lula tem 40% em Santa Cruz", pt: 40, esc: "br" },
  { t: "Flávio lidera em Santiago com 58%", bolso: 58, esc: "br" },
  { t: "Lula vence em Buenos Aires", esc: "br", venc: null },
  { t: "Lula tem 45% em Franca (SP)", pt: 45, esc: "mun:Franca/sp" },
  { t: "Lula vence em Franca com 52%", pt: 52, esc: "mun:Franca/sp", venc: "pt" },
  { t: "Lula vence na França com 60%", pt: 60, esc: "pais:França", venc: "pt" },
  { t: "Flávio vence na Colômbia", esc: "pais:Colômbia", venc: "bolso" },
  { t: "Lula vence na Tailândia; em Tailândia (PA), Flávio tem 55%", esc: "pais:Tailândia", venc: "pt" },
  { t: "Em Tailândia (PA), Flávio tem 55%", bolso: 55, esc: "mun:Tailândia/pa" },
  { t: "Lula vota em Praia Grande e diz confiar na vitória", esc: "br", venc: null },
  { t: "Lula vota em Praia Grande (SP)", esc: "mun:Praia Grande/sp" },
  { t: "Flávio vence no RJ com 51%; no Japão, Lula", bolso: 51, esc: "uf:rj", venc: "bolso" },
  { t: "Flávio vence no Japão e em SP", esc: "pais:Japão", venc: "bolso" },
  { t: "Em SP, Flávio vence; no Japão, Lula", esc: "uf:sp", venc: "bolso" },
  { t: "Lula vence em Belém com 58%", pt: 58, esc: "mun:Belém/pa", venc: "pt" },
  { t: "Presidente da França parabeniza o Brasil pela democracia", tipo: "outro", esc: "br", venc: null },
  { t: "Lula vence no Paraná? Não: Flávio tem 61% no estado", bolso: 61, esc: "uf:pr", venc: null },
  { t: "Lula diz que vai vencer no Japão", venc: null },
  { t: "Lula vence debate na Band", esc: "br", venc: null },
  { t: "Lula vence com 50,8% dos votos válidos e é reeleito no 1º turno", pt: 50.8, esc: "br", venc: "pt" },
  { t: "Datafolha: Lula lidera em Pernambuco com 65%", tipo: "pesquisa", pt: 65, esc: "uf:pe", venc: null },
];

/**
 * Revisão adversarial do exterior (04/10/2026): homônimos (Japeri, Holambra, Coimbra/MG, Paris (TX)…),
 * perguntas ("Lula vence no Japão? Não: …"), falas ("diz que vence"), números de outro lugar
 * ("Flávio tem 70% no Japão e Lula 60% na China"), listas de cidades e o total do exterior.
 */
const CASOS_REVISAO_EXTERIOR: Caso[] = [
  // manchetes reais (Google Notícias, 04/10/2026, à tarde)
  { t: "Lula lidera votação no exterior em cinco países enquanto Flávio Bolsonaro vence em três", esc: "uf:zz", venc: null },
  { t: "Lula vence em mais países no exterior, mas Flávio lidera na contagem preliminar", esc: "uf:zz", venc: "bolso" },
  { t: "Flávio Bolsonaro obtém 63,80% dos votos em Tóquio e 73,51% em Toyohashi, apontam boletins de urna", bolso: 63.8, esc: "mun:Tóquio/zz", venc: null },
  { t: "Lisboa lidera em número de eleitores brasileiros no exterior e tenta organizar pleito sem transtornos", venc: null },
  { t: "URGENTE: Com 39 países e territórios, Flávio Bolsonaro lidera com 54,9%, apesar de Lula vencer em 22 países", bolso: 54.9, esc: "uf:zz" },
  { t: "Lula lidera no exterior", esc: "uf:zz", venc: "pt" },
  { t: "Lula vence em Lisboa", tipo: "apuracao", esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Flávio ganha em Miami", tipo: "apuracao", esc: "mun:Miami/zz", venc: "bolso" },
  { t: "Lula vence no Japão? Não: Flávio lidera em Hamamatsu", esc: "mun:Hamamatsu/zz", venc: "bolso" },
  { t: "Brasileiros no Japão votam neste domingo", tipo: "outro", esc: "pais:Japão", venc: null },
  { t: "Lula vence em 6 países e Flávio em 4", tipo: "apuracao", esc: "uf:zz", venc: null },
  { t: "No Paraguai, Flávio tem 60%", bolso: 60, pt: null, esc: "pais:Paraguai" },
  { t: "Em Portugal, Lula tem 55% dos votos", pt: 55, bolso: null, esc: "pais:Portugal" },
  { t: "Lula vence em Japeri", esc: "mun:Japeri/rj", venc: "pt" },
  { t: "Flávio vence em Holambra", esc: "mun:Holambra/sp", venc: "bolso" },
  { t: "Lula vence em Nova Friburgo com 48%", pt: 48, esc: "mun:Nova Friburgo/rj", venc: "pt" },
  { t: "Flávio lidera em Santa Cruz do Sul", esc: "mun:Santa Cruz do Sul/rs", venc: "bolso" },
  { t: "Em Rio Branco, Flávio vence com 62%", bolso: 62, esc: "mun:Rio Branco/ac", venc: "bolso" },
  { t: "Lula vence em Paris (TX)", esc: "br" },
  { t: "Lula vence em Paris, na França", esc: "mun:Paris/zz", venc: "pt" },
  { t: "Flávio vence em Londrina com 65%", bolso: 65, esc: "mun:Londrina/pr", venc: "bolso" },
  { t: "Lula ganha em Londres com 65%", pt: 65, esc: "mun:Londres/zz", venc: "pt" },
  { t: "Em Tóquio, Flávio tem 70%; em Lisboa, Lula tem 60%", bolso: 70, pt: null, esc: "mun:Tóquio/zz" },
  { t: "Flávio vence nos Estados Unidos", esc: "pais:Estados Unidos", venc: "bolso" },
  { t: "Lula vence em Washington e Flávio em Miami", esc: "mun:Washington/zz", venc: "pt" },
  { t: "Lula lidera entre brasileiros na Itália, com 52%", pt: 52, esc: "pais:Itália", venc: "pt" },
  { t: "Japão dá vitória a Flávio; China, a Lula", esc: "pais:Japão", venc: "bolso" },
  { t: "Brasileiros em Portugal elegem Lula", esc: "pais:Portugal", venc: "pt" },
  { t: "Lula é o mais votado em Lisboa e no Porto", esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Resultado em Assunção: Flávio 61%, Lula 30%", bolso: 61, pt: 30, esc: "br" },
  { t: "Paraguai: Flávio tem 60% e Lula 32%", bolso: 60, pt: 32, esc: "pais:Paraguai" },
  { t: "Lula vence em Moçambique e Angola", esc: "pais:Moçambique", venc: "pt" },
  { t: "Flávio vence em Ciudad del Este", esc: "mun:Ciudad del Este/zz", venc: "bolso" },
  { t: "Brasileiros em Miami fazem fila para votar", tipo: "outro", esc: "mun:Miami/zz", venc: null },
  { t: "Lula vence em Santa Cruz de la Sierra", esc: "mun:Santa Cruz de la Sierra/zz", venc: "pt" },
  { t: "Lula vence na Holanda e Flávio em Amsterdã", esc: "pais:Países Baixos", venc: "pt" },
  { t: "Lula vence em Montevidéu com 58%", pt: 58, esc: "mun:Montevidéu/zz", venc: "pt" },
  { t: "Lula vence em Rivera, no Uruguai", esc: "mun:Rivera/zz", venc: "pt" },
  { t: "Flávio vence em Lima, no Peru", esc: "mun:Lima/zz", venc: "bolso" },
  { t: "Flávio Lima vence eleição em clube", venc: null, esc: "br" },
  { t: "Lula lidera na Europa", esc: "uf:zz", venc: null },
  { t: "Flávio lidera na Ásia; Lula, na Europa", esc: "uf:zz", venc: null },
  { t: "Lula vence em Barcelona (RN)", esc: "mun:Barcelona/rn", venc: "pt" },
  { t: "Lula vence em Barcelona, na Espanha", esc: "mun:Barcelona/zz", venc: "pt" },
  { t: "Lula vence em Cabo Verde (MG)", esc: "mun:Cabo Verde/mg", venc: "pt" },
  { t: "Lula vence em Cabo Verde", esc: "pais:Cabo Verde", venc: "pt" },
  { t: "LULA VENCE NA FRANÇA", esc: "pais:França", venc: "pt" },
  { t: "LULA VENCE EM FRANCA", esc: "mun:Franca/sp", venc: "pt" },
  { t: "Lula vence na Guiana Francesa", esc: "pais:Guiana Francesa", venc: "pt" },
  { t: "Lula vence em Nova Iorque com 55%", pt: 55, esc: "br", venc: null },
  { t: "Lula vence no México", esc: "pais:México", venc: "pt" },
  { t: "Flávio vence em Orlando, nos EUA", esc: "mun:Orlando/zz", venc: "bolso" },
  { t: "Orlando Silva diz que Lula vence no 1º turno", esc: "br", venc: null },
  { t: "Lula vence em São Francisco, nos EUA", esc: "mun:São Francisco/zz", venc: "pt" },
  { t: "Flávio vence em São Francisco (MG)", esc: "mun:São Francisco/mg", venc: "bolso" },
  { t: "Lula vence em Colombo (PR)", esc: "mun:Colombo/pr", venc: "pt" },
  { t: "Lula vence em Colombo, no Sri Lanka", esc: "mun:Colombo/zz", venc: "pt" },
  { t: "Lula perde no Japão, mas vence na China", esc: "pais:Japão", venc: null },
  { t: "Flávio Bolsonaro vence em Hamamatsu, cidade com mais eleitores brasileiros no Japão", esc: "mun:Hamamatsu/zz", venc: "bolso" },
  { t: "Lula não vence no Japão", venc: null },
  { t: "Lula pode vencer na China, diz analista", venc: null },
  { t: "Flávio vence em Israel com 80%", bolso: 80, esc: "pais:Israel", venc: "bolso" },
  { t: "Lula vence em Timor-Leste", esc: "pais:Timor-Leste", venc: "pt" },
  { t: "Lula vence na Guiné-Bissau", esc: "pais:Guiné-Bissau", venc: "pt" },
  { t: "Em Hong Kong, Flávio tem 51% e Lula 40%", bolso: 51, pt: 40, esc: "mun:Hong Kong/zz" },
  { t: "Flávio vence no Japão com 73%; Lula tem 20%", bolso: 73, pt: 20, esc: "pais:Japão", venc: "bolso" },
  { t: "Lula vence na Suíça, em Genebra e Zurique", esc: "pais:Suíça", venc: "pt" },
  { t: "Lula vence em Toronto, no Canadá", esc: "mun:Toronto/zz", venc: "pt" },
  { t: "Flávio vence no Canadá, em Toronto", esc: "mun:Toronto/zz", venc: "bolso" },
  { t: "Lula vence em São José, na Costa Rica", esc: "mun:São José/zz", venc: "pt" },
  { t: "Lula vence em São José dos Campos", esc: "mun:São José dos Campos/sp", venc: "pt" },
  { t: "Flávio vence em Georgetown, na Guiana", esc: "mun:Georgetown/zz", venc: "bolso" },
  { t: "Flávio tem 70% no Japão e Lula 60% na China", bolso: 70, pt: null, esc: "pais:Japão" },
  { t: "Lula tem 56,94% na Coreia do Sul", pt: 56.94, esc: "pais:Coreia do Sul" },
  { t: "Na Coreia do Sul, Lula vence com 56,94% e Flávio tem 30,1%", pt: 56.94, bolso: 30.1, esc: "pais:Coreia do Sul", venc: "pt" },
  { t: "Lula vence em Salvador e Flávio em São Salvador, em El Salvador", esc: "mun:Salvador/ba", venc: "pt" },
  { t: "Lula vence em Viena e Flávio em Berlim", esc: "mun:Viena/zz", venc: "pt" },
  { t: "Lula vence em Berlim; Flávio, em Munique", esc: "mun:Berlim/zz", venc: "pt" },
  { t: "Votação em Nagóia: Flávio tem 75%", bolso: 75, esc: "mun:Nagóia/zz" },
  { t: "Lula vence em Angola com 70%", pt: 70, esc: "pais:Angola", venc: "pt" },
  { t: "Lula vence no Peru", esc: "pais:Peru", venc: "pt" },
  { t: "Lula vence em Brasília", esc: "mun:Brasília/df", venc: "pt" },
  { t: "Flávio ganha na Bolívia; Lula, em La Paz", esc: "pais:Bolívia", venc: "bolso" },
  { t: "Lula vence em Dublin, na Irlanda", esc: "mun:Dublin/zz", venc: "pt" },
  { t: "Lula vence em Irlanda", esc: "pais:Irlanda", venc: "pt" },
  { t: "Lula vence em Atenas", esc: "mun:Atenas/zz", venc: "pt" },
  { t: "Flávio Bolsonaro vence em Houston e Atlanta", esc: "mun:Houston/zz", venc: "bolso" },
  { t: "Na Argentina, Lula vence em Buenos Aires e Flávio em Córdoba", esc: "pais:Argentina", venc: null },
  { t: "Flávio vence na Austrália? Não, Lula vence com 57%", pt: 57, esc: "pais:Austrália", venc: "pt" },
  { t: "Lula vence em Cuba", esc: "pais:Cuba", venc: "pt" },
  { t: "Lula vence em Havana", esc: "mun:Havana/zz", venc: "pt" },
  { t: "Lula vence na Venezuela; Flávio, na Argentina", esc: "pais:Venezuela", venc: "pt" },
  { t: "Lula vence em Canadá e Flávio em EUA", esc: "pais:Canadá", venc: "pt" },
  { t: "Eleição no exterior: Lula 52% x 45% Flávio", pt: 52, bolso: 45, esc: "uf:zz" },
  { t: "Exterior: Lula tem 52% e Flávio 45% com 60% das seções apuradas", pt: 52, bolso: 45, apur: 60, esc: "uf:zz" },
  { t: "Lula tem 52% no exterior", pt: 52, esc: "uf:zz" },
  { t: "Votos do exterior: Flávio vence com 51%", bolso: 51, esc: "uf:zz", venc: "bolso" },
  { t: "Flávio Bolsonaro vence em Hamamatsu; Lula, em Tóquio", esc: "mun:Hamamatsu/zz", venc: "bolso" },
  { t: "Lula vence em Lisboa com 60% e Flávio tem 35%", pt: 60, bolso: 35, esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Em Lisboa, Lula tem 60%; Flávio, 35%", pt: 60, bolso: 35, esc: "mun:Lisboa/zz" },
  { t: "Na China, Lula tem 60%; no Japão, Flávio, 73%", pt: 60, bolso: null, esc: "pais:China" },
  { t: "Flávio tem 73% dos votos válidos no Japão; Lula, 20%", bolso: 73, pt: 20, esc: "pais:Japão" },
  { t: "Flávio diz que vence no Japão", venc: null },
  { t: "Aliados apostam em vitória de Lula no Japão", venc: null },
  { t: "Comemoração: vitória de Lula na China", esc: "pais:China", venc: "pt" },
  { t: "Lula diz que Flávio vence no Japão", venc: null },
  { t: "Lula é eleito no exterior?", venc: null },
  { t: "Flávio vence em todas as cidades do Japão", esc: "pais:Japão", venc: "bolso" },
  { t: "Lula vence em Portugal, na Espanha e na França", esc: "pais:Portugal", venc: "pt" },
  { t: "Flávio vence no Paraguai com 62% dos votos; Lula tem 30%", bolso: 62, pt: 30, esc: "pais:Paraguai", venc: "bolso" },
  { t: "Lula vence em Portugal, e Flávio Bolsonaro tem 40% na Espanha", bolso: null, esc: "pais:Portugal", venc: "pt" },
  { t: "Exterior: Flávio vence no Japão com 73%", bolso: 73, esc: "pais:Japão", venc: "bolso" },
  { t: "Resultados do exterior: Lula 50,2%, Flávio 42,1%, com 300 de 1.351 seções", pt: 50.2, bolso: 42.1, esc: "uf:zz" },
  { t: "Total do exterior: Flávio 49%, Lula 44%", bolso: 49, pt: 44, esc: "uf:zz" },
  { t: "Votação no exterior: Lula tem 48,5% e Flávio, 43,2%", pt: 48.5, bolso: 43.2, esc: "uf:zz" },
  { t: "Lula vence no exterior com 48,5%; no Japão, Flávio tem 73%", pt: 48.5, bolso: null, esc: "uf:zz", venc: "pt" },
  { t: "Paraguai, Bolívia e Argentina dão vitória a Flávio", esc: "pais:Paraguai", venc: "bolso" },
  { t: "Na Bolívia, em Santa Cruz de la Sierra, Flávio vence", esc: "mun:Santa Cruz de la Sierra/zz", venc: "bolso" },
  { t: "Lula vence na Itália, em Roma e Milão", esc: "pais:Itália", venc: "pt" },
  { t: "Lula vence em Roma, mas perde em Milão", esc: "mun:Roma/zz", venc: "pt" },
  { t: "Em Milão, Flávio; em Roma, Lula", esc: "br", venc: null },
  { t: "Lula vence em Mendoza e Córdoba, na Argentina", esc: "mun:Mendoza/zz", venc: "pt" },
  { t: "Lula vence em Toledo (PR)", esc: "mun:Toledo/pr", venc: "pt" },
  { t: "Lula vence em Lisboa; Flávio vence em São Paulo", esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Flávio ganha em Boston com 52% e Lula 45%", bolso: 52, pt: 45, esc: "mun:Boston/zz", venc: "bolso" },
  { t: "Lula ganha em Boston com 52% e Flávio vence em Miami com 60%", pt: 52, bolso: null, esc: "mun:Boston/zz", venc: "pt" },
  { t: "Lula lidera entre brasileiros nos EUA", esc: "pais:Estados Unidos", venc: "pt" },
  { t: "Brasileiros nos EUA dão vitória a Flávio, mas Lula vence em Boston", esc: "pais:Estados Unidos", venc: "bolso" },
  { t: "Lula supera Flávio em Londres", esc: "mun:Londres/zz", venc: "pt" },
  { t: "Flávio é o mais votado em Tóquio", esc: "mun:Tóquio/zz", venc: "bolso" },
  { t: "Lula foi o candidato mais votado entre os brasileiros que vivem em Paris", esc: "mun:Paris/zz", venc: "pt" },
  { t: "Lula ficou em segundo no Japão", venc: null },
  { t: "Holanda: Lula vence com 60%", pt: 60, esc: "pais:Países Baixos", venc: "pt" },
  { t: "Flávio vence em Hong Kong e Lula em Macau", esc: "mun:Hong Kong/zz", venc: "bolso" },
  { t: "Lula vence em Taiwan", esc: "pais:Taiwan", venc: "pt" },
  { t: "Flávio vence em Taipé", esc: "mun:Taipé/zz", venc: "bolso" },
  { t: "Lula vence na Palestina", esc: "pais:Palestina", venc: "pt" },
  { t: "No Japão, Flávio tem 73% e, na China, Lula tem 60%", bolso: 73, pt: null, esc: "pais:Japão" },
  { t: "Lula vence na China e Flávio tem 70% no Japão", bolso: null, esc: "pais:China", venc: "pt" },
  { t: "Flávio tem 70% no Japão, em Tóquio", bolso: 70, esc: "mun:Tóquio/zz" },
  { t: "Em SP, Flávio tem 52%, mas no Rio Lula tem 48%", bolso: 52, pt: null, esc: "uf:sp" },
  { t: "Em Campinas, Flávio tem 50%; em Sorocaba, Lula tem 45%", bolso: 50, pt: null, esc: "mun:Campinas/sp" },
  { t: "Flávio tem 44% no país; no exterior, Lula tem 52%", bolso: 44, pt: null, esc: "br" },
  { t: "Lula vence em Paris, Texas", esc: "br", venc: null },
  { t: "Flávio vence em Miami (FL) com 70%", bolso: 70, esc: "mun:Miami/zz", venc: "bolso" },
  { t: "Lula vence em Boston, MA", esc: "mun:Boston/zz", venc: "pt" },
  { t: "Lula vence no Japão? Não: Flávio lidera com 73%", bolso: 73, esc: "pais:Japão", venc: "bolso" },
  { t: "Quem venceu no Japão? Flávio, com 73%", bolso: 73, esc: "pais:Japão" },
  { t: "Lula ou Flávio: quem lidera no exterior?", esc: "uf:zz", venc: null },
  { t: "LULA VENCE EM PORTUGAL E FLÁVIO NO JAPÃO", esc: "pais:Portugal", venc: "pt" },
  { t: "LULA TEM 55% EM PORTUGAL", pt: 55, esc: "pais:Portugal" },
  { t: "Flávio tem 60% no Paraguai e Lula, 32%", bolso: 60, pt: 32, esc: "pais:Paraguai" },
  { t: "Lula teve 60% no Japão em 2022; agora Flávio lidera com 73%", bolso: 73, pt: null, esc: "pais:Japão" },
  { t: "Lula vence em Coimbra", esc: "mun:Coimbra/mg", venc: "pt" },
  { t: "Flávio vence em Hamamatsu (Japão) com 75%", bolso: 75, esc: "mun:Hamamatsu/zz", venc: "bolso" },
  { t: "Japão (Hamamatsu): Flávio 75%, Lula 18%", bolso: 75, pt: 18, esc: "mun:Hamamatsu/zz" },
  { t: "Brasileiros em Nova York elegem Lula com 58%", pt: 58, esc: "mun:Nova York/zz", venc: "pt" },
  { t: "Lula tem 47% e Flávio 43% no Brasil; em SP, Flávio lidera", pt: 47, bolso: 43, esc: "br" },
  { t: "Em Minas, Lula tem 48% e Flávio 44% com 55% apurado", pt: 48, bolso: 44, apur: 55, esc: "uf:mg" },
  { t: "Lula tem 48% em Minas Gerais e Flávio, 44%", pt: 48, bolso: 44, esc: "uf:mg" },
  { t: "Flávio vence em SP com 52% e Lula tem 40% no estado", bolso: 52, pt: 40, esc: "uf:sp", venc: "bolso" },
  { t: "Lula vence em Salvador com 70%; Flávio vence em Florianópolis com 60%", pt: 70, bolso: null, esc: "mun:Salvador/ba", venc: "pt" },
  { t: "Em Belo Horizonte, Lula tem 44% e Flávio 47%", pt: 44, bolso: 47, esc: "mun:Belo Horizonte/mg" },
  { t: "Lula lidera em Pernambuco com 65% e Flávio em Santa Catarina com 62%", pt: 65, bolso: null, esc: "uf:pe", venc: "pt" },
  { t: "Lula tem 52% no Rio Grande do Norte e Flávio 41%", pt: 52, bolso: 41, esc: "uf:rn" },
  { t: "Apuração em São Paulo: Flávio tem 50% e Lula 42% na capital", bolso: 50, pt: 42 },
  { t: "Na Bahia, Lula tem 70%; em Salvador, 72%", pt: 70, esc: "uf:ba" },
  { t: "Flávio tem 55% no DF e 60% em Goiás", bolso: 55, esc: "uf:df" },
  { t: "Lula tem 48% no 1º turno em SP", pt: 48, esc: "uf:sp" },
  { t: "Em Campinas (SP), Lula tem 41%", pt: 41, esc: "mun:Campinas/sp" },
  { t: "Lula tem 41% em Campinas, no interior de SP", pt: 41, esc: "mun:Campinas/sp" },
  { t: "Lula tem 41% em Campinas e Flávio 50% em Ribeirão Preto", pt: 41, bolso: null, esc: "mun:Campinas/sp" },
  { t: "Lula tem 41% em Campinas; Flávio, 50%", pt: 41, bolso: 50, esc: "mun:Campinas/sp" },
  { t: "Lula vence no Japão e em Japeri", esc: "pais:Japão", venc: "pt" },
  { t: "Flávio vence em Japeri; no Japão, Lula", esc: "mun:Japeri/rj", venc: "bolso" },
  { t: "Em Holambra, Flávio tem 60%; na Holanda, Lula tem 55%", bolso: 60, pt: null, esc: "mun:Holambra/sp" },
  { t: "Lula tem 48% dos votos no exterior e Flávio 45%", pt: 48, bolso: 45, esc: "uf:zz" },
  { t: "No exterior, Flávio tem 49% e Lula 44% com 400 seções apuradas", bolso: 49, pt: 44, esc: "uf:zz" },
  { t: "Fila em Lisboa: brasileiros esperam horas para votar", tipo: "outro", esc: "mun:Lisboa/zz", venc: null },
  { t: "Consulado em Miami registra filas de eleitores", tipo: "outro", venc: null },
  { t: "Com 45,3% das urnas apuradas, Lula tem 47,2% e Flávio Bolsonaro, 43,1%", apur: 45.3, pt: 47.2, bolso: 43.1, esc: "br" },
  { t: "Lula 47,2% x 43,1% Flávio em SP", pt: 47.2, bolso: 43.1, esc: "uf:sp" },
  { t: "Em SP, Flávio Bolsonaro tem 50%. No Brasil, Lula lidera com 47%", bolso: 50, pt: null, esc: "uf:sp" },
  { t: "Flávio tem 61% no Paraná, 58% em Santa Catarina e 55% no Rio Grande do Sul", bolso: 61, esc: "uf:pr" },
  { t: "Lula tem 70% no Piauí e no Maranhão", pt: 70, esc: "uf:pi" },
  { t: "Lula tem 52% em Natal (RN) e Flávio, 40%", pt: 52, bolso: 40, esc: "mun:Natal/rn" },
  { t: "Lula diz que vence no 1º turno", venc: null },
  { t: "Flávio diz confiar que vence no 2º turno", venc: null },
  { t: "Datafolha indica que Lula vence no 1º turno", venc: null },
  { t: "Lula é reeleito presidente no 1º turno com 50,8%", pt: 50.8, esc: "br", venc: "pt" },
  { t: "Flávio Bolsonaro é eleito presidente com 50,3% dos votos válidos", bolso: 50.3, esc: "br", venc: "bolso" },
  { t: "TSE confirma: Lula vence no 1º turno", esc: "br", venc: "pt" },
  { t: "Lula vence o 1º turno e vai ao 2º turno com Flávio", esc: "br", venc: "pt" },
];

/** Manchete + resumo (agregador) — conferidos em unitAgregador. */
const CASOS_EXTRAIR: (Caso & { r: string })[] = [
  { t: "Eleições no exterior: veja resultados", r: "Lula vence na China; Flávio leva o Japão", esc: "pais:China", venc: "pt" },
  { t: "Lula vence na China", r: "Flávio Bolsonaro, por sua vez, venceu no Japão com 73%", esc: "pais:Japão", venc: "bolso", bolso: 73 },
  { t: "Flávio vence no Japão", r: "Com 73,4% dos votos válidos, Flávio Bolsonaro foi o mais votado", esc: "pais:Japão", venc: "bolso", bolso: 73.4 },
  { t: "Lula vence em Lisboa", r: "O petista teve 61% dos votos válidos na capital portuguesa", esc: "mun:Lisboa/zz", venc: "pt" },
  { t: "Votação no exterior", r: "Em Tóquio, Flávio tem 70%; em Lisboa, Lula tem 60%", esc: "mun:Tóquio/zz", bolso: 70, pt: null },
  { t: "Flávio lidera no exterior", r: "No Japão, ele tem 73%", esc: "uf:zz", venc: "bolso" },
];

function conferir(c: Caso, pronto?: { tipo: TipoBoletim; extraido: NumerosBoletim }): string[] {
  const erros: string[] = [];
  const tipo = pronto ? pronto.tipo : classificarBoletim(c.t);
  const r: NumerosBoletim = pronto ? pronto.extraido : parseBoletim(c.t, municipios);
  if (c.tipo && tipo !== c.tipo) erros.push(`tipo=${tipo} (esperado ${c.tipo})`);
  const chk = (nome: string, got: number | undefined, exp: number | null | undefined) => {
    if (exp === undefined) return;
    if (exp === null && got !== undefined) erros.push(`${nome}=${got} (esperado ausente)`);
    if (exp !== null && (got === undefined || Math.abs(got - exp) > 1e-9)) erros.push(`${nome}=${fmtNum(got)} (esperado ${exp})`);
  };
  chk("apur", r.pctApurado, c.apur);
  chk("pt", r.pt, c.pt);
  chk("bolso", r.bolso, c.bolso);
  if (c.venc !== undefined && (r.vencedor ?? null) !== c.venc) erros.push(`venc=${r.vencedor ?? "—"} (esperado ${c.venc ?? "ausente"})`);
  if (c.esc) {
    const e = r.escopo;
    let got = "?";
    if (e?.tipo === "br") got = "br";
    else if (e?.tipo === "uf") got = `uf:${e.uf}`;
    else if (e?.tipo === "pais") got = `pais:${e.pais}`;
    else if (e?.tipo === "mun") {
      const t = municipios.find((m) => m[0] === e.mun && m[2] === e.uf);
      got = `mun:${t ? t[1] : e.mun}/${e.uf}`;
    }
    const pularMun = c.esc.startsWith("mun:") && municipios.length === 0;
    if (!pularMun && got !== c.esc) erros.push(`escopo=${got} [${e?.nome}] (esperado ${c.esc})`);
  }
  return erros;
}

function unit(): boolean {
  const todos = [...CASOS, ...CASOS_REVISAO, ...CASOS_EXTERIOR, ...CASOS_REVISAO_EXTERIOR];
  console.log(
    `\n=== Testes unitários: ${CASOS.length} + ${CASOS_REVISAO.length} (revisão) + ${CASOS_EXTERIOR.length} (exterior) + ${CASOS_REVISAO_EXTERIOR.length} (revisão exterior) casos (municípios: ${municipios.length}) ===`,
  );
  let falhas = 0;
  let falhasRev = 0;
  for (const c of todos) {
    const erros = conferir(c);
    if (erros.length) {
      falhas++;
      if (CASOS_REVISAO.includes(c)) falhasRev++;
      console.log(`✗ ${c.t}\n    → ${erros.join("; ")}`);
    }
  }
  console.log(`revisão: ${CASOS_REVISAO.length - falhasRev}/${CASOS_REVISAO.length} ok`);
  const falhasRevExt = CASOS_REVISAO_EXTERIOR.filter((c) => conferir(c).length).length;
  console.log(`revisão exterior: ${CASOS_REVISAO_EXTERIOR.length - falhasRevExt}/${CASOS_REVISAO_EXTERIOR.length} ok`);
  // isomorfismo: sem lista de municípios não pode quebrar
  const semMun = parseBoletim("Em Campinas, Lula tem 41% com 10% das urnas apuradas");
  if (semMun.pt !== 41 || semMun.pctApurado !== 10 || semMun.escopo?.tipo !== "br") {
    falhas++;
    console.log("✗ parse sem municípios", JSON.stringify(semMun));
  }
  const vazio = parseBoletim("");
  if (vazio.escopo?.tipo !== "br" || vazio.pt !== undefined) {
    falhas++;
    console.log("✗ texto vazio", JSON.stringify(vazio));
  }
  console.log(`${todos.length + 2 - falhas}/${todos.length + 2} ok`);
  return falhas === 0;
}

/** Peças do agregador que não dependem de rede: manchete+resumo, relevância, busca, RSS, datas. */
async function unitAgregador(): Promise<boolean> {
  const { extrair, relevante, casaConsulta, consultaExterior, lerRss, parseData } = await import("../../src/lib/news/fetch");
  const { normalizarBusca } = await import("../../src/lib/news/parse");
  let falhas = 0;
  const ok = (cond: boolean, nome: string, extra?: unknown) => {
    if (!cond) {
      falhas++;
      console.log(`✗ agregador: ${nome}`, extra === undefined ? "" : JSON.stringify(extra));
    }
  };
  // números só no resumo → escopo do resumo; resumo sem lugar → escopo da manchete
  const e1 = extrair(
    "Datafolha, 1º turno - votos válidos: Na véspera da eleição, Flávio Bolsonaro lidera em SP, RJ e DF; Lula, em PE",
    "Datafolha para presidente no Piauí, votos válidos: Lula, 66%; Flávio Bolsonaro, 25%",
    municipios,
  );
  ok(e1.extraido.pt === 66 && e1.extraido.escopo?.uf === "pi", "escopo do resumo (Piauí)", e1);
  const e2 = extrair("Apuração em Campinas", "Na cidade, Lula tem 41% e Flávio, 50%, com 60% das urnas apuradas", municipios);
  ok(e2.tipo === "apuracao" && e2.extraido.pt === 41 && e2.extraido.pctApurado === 60 && (municipios.length === 0 || e2.extraido.escopo?.mun === "62910"), "escopo da manchete (Campinas)", e2);
  const e3 = extrair("Lula tem 47% com 30% apurado", "Em SP, Flávio lidera com 50%", municipios);
  // os 50% do resumo são de SP (outro lugar) → não entram no boletim nacional
  ok(e3.extraido.pt === 47 && e3.extraido.bolso === undefined && e3.extraido.escopo?.tipo === "br", "manchete com números mantém escopo Brasil", e3);
  // exterior: manchete genérica + resumo com o país → escopo/vencedor do resumo
  const e4 = extrair("Eleições no exterior: veja os primeiros resultados", "Lula vence na China com 60% dos votos válidos", municipios);
  ok(e4.extraido.escopo?.tipo === "pais" && e4.extraido.escopo.pais === "China" && e4.extraido.vencedor === "pt" && e4.extraido.pt === 60, "exterior: escopo/vencedor do resumo (China)", e4);
  const e5 = extrair("Lula vence na China e em mais cinco países; Flávio fica em 1º no Japão e em mais três", "Veja os resultados dos boletins de urna do exterior", municipios);
  ok(e5.tipo === "apuracao" && e5.extraido.escopo?.pais === "China" && e5.extraido.vencedor === "pt", "exterior: manchete manda (China/pt)", e5);
  const e6 = extrair("Flávio Bolsonaro lidera no Japão", "", municipios);
  ok(e6.extraido.escopo?.nome === "Japão (exterior)" && e6.extraido.escopo?.uf === "zz" && e6.extraido.vencedor === "bolso", "exterior: Japão/bolso", e6);
  const e7 = extrair("Flávio vence em Tóquio", "", municipios);
  ok(municipios.length === 0 || (e7.extraido.escopo?.mun === "30627" && e7.extraido.escopo?.nome === "Tóquio (Japão)"), "exterior: cidade Tóquio (Japão)", e7);
  const e8 = extrair("Votação no exterior: Lula vence em nove países; Flávio fica em 1º em seis", "Lula venceu na Austrália, na China e na Coreia do Sul", municipios);
  ok(e8.extraido.escopo?.tipo === "uf" && e8.extraido.escopo.uf === "zz" && !e8.extraido.vencedor, "exterior: manchete de contagem fica em Exterior", e8);
  for (const c of CASOS_EXTRAIR) {
    const erros = conferir(c, extrair(c.t, c.r, municipios));
    ok(!erros.length, `extrair "${c.t}" + "${c.r}" → ${erros.join("; ")}`);
  }
  // países sem a lista de municípios (isomórfico: vem de src/lib/exterior/paises.ts)
  const { parseBoletim: pb } = await import("../../src/lib/news/parse");
  const semMun = pb("Lula vence na Nova Zelândia com 70%");
  ok(semMun.escopo?.tipo === "pais" && semMun.escopo.pais === "Nova Zelândia" && semMun.vencedor === "pt" && semMun.pt === 70, "exterior sem municípios", semMun);
  // busca: "exterior" e o nome do país casam com o escopo
  ok(casaConsulta(normalizarBusca("Lula vence na China"), "exterior", { tipo: "pais", uf: "zz", pais: "China", nome: "China (exterior)" }), "q=exterior casa país");
  ok(casaConsulta(normalizarBusca("Flávio vence em Tóquio"), "Japão", { tipo: "mun", uf: "zz", mun: "30627", nome: "Tóquio (Japão)" }), "q=Japão casa Tóquio (Japão)");
  ok(!casaConsulta(normalizarBusca("Lula vence na China"), "Japão", { tipo: "pais", uf: "zz", pais: "China", nome: "China (exterior)" }), "q=Japão não casa China");
  ok(consultaExterior("Japão") && consultaExterior("exterior") && consultaExterior("EUA") && !consultaExterior("Campinas") && !consultaExterior("SP"), "consultaExterior");
  // relevância
  const rel = (t: string) => relevante(normalizarBusca(t), normalizarBusca(t));
  ok(rel("Primeiros boletins de urna do exterior mostram resultados na Ásia e Oceania"), "boletins de urna do exterior são relevantes");
  ok(rel("Eleições no exterior: veja resultados parciais por país no 1º turno"), "eleições no exterior são relevantes");
  ok(!rel("Turistas brasileiros lotam praias no exterior"), "turismo no exterior não é relevante");
  ok(!rel("Flávio Dino vota em São Luís e elogia urnas eletrônicas"), "Flávio Dino não é relevante");
  ok(rel("Flávio Bolsonaro vota no Rio"), "Flávio Bolsonaro é relevante");
  ok(!rel("Tarcísio tem 55% para governador de SP"), "governador fora");
  ok(rel("Apuração para presidente: Lula tem 47%"), "apuração presidencial");
  // busca: siglas curtas exigem a palavra inteira
  ok(!casaConsulta(normalizarBusca("Sport vence e torcida comemora"), "SP"), "SP ≠ Sport");
  ok(casaConsulta(normalizarBusca("Lula tem 40% em SP"), "SP"), "SP casa");
  ok(casaConsulta(normalizarBusca("Lula vence em Campinas"), "campinas"), "Campinas casa");
  // Google Notícias: "Veículo: manchete" e "manchete - Veículo"
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Sampi Campinas: Flávio Bolsonaro vota em escola no Rio de Janeiro - Sampi Campinas</title><link>https://news.google.com/x</link>
      <pubDate>Sun, 04 Oct 2026 13:06:00 GMT</pubDate><source url="https://sampi.net.br">Sampi Campinas</source></item>
    <item><title>Exame mostra Lula com 47% - Exame</title><link>https://news.google.com/y</link>
      <pubDate>Sun, 04 Oct 2026 13:06:00 GMT</pubDate><source url="https://exame.com">Exame</source></item>
  </channel></rss>`;
  const its = lerRss(xml, true);
  ok(its[0]?.titulo === "Flávio Bolsonaro vota em escola no Rio de Janeiro", "prefixo do veículo removido", its[0]);
  ok(its[1]?.titulo === "Exame mostra Lula com 47%", "nome do veículo no início da frase preservado", its[1]);
  // datas
  const agora = Date.parse("2026-10-04T15:00:00Z");
  ok(parseData("Dom, 04 Out 2026 11:00:00 -0300", agora) === "2026-10-04T14:00:00.000Z", "data em português");
  ok(parseData("Sun, 04 Oct 2026 14:30:00 -0300", agora) === "2026-10-04T14:30:00.000Z", "UTC rotulado -03:00 (UOL) corrigido");
  console.log(`agregador: ${falhas ? "FALHOU" : "ok"}`);
  return falhas === 0;
}

/** Painel do g1 (estrutura real de PRESIDENTE_BRASIL.JSON, valores fictícios). */
async function unitPainel(): Promise<boolean> {
  const { boletinsPainelG1 } = await import("../../src/lib/news/fetch");
  const cands = (lula: string, flavio: string) => [
    { nc: "CLARIANA BARAO", tc: "BR_27_PRES", tp: "0,50%", v: "10" },
    { nc: "FLAVIO BOLSONARO", tc: "BR_22_PRES", tp: flavio, v: "100" },
    { nc: "LUIZ INÁCIO LULA DA SILVA", tc: "BR_13_PRES", tp: lula, v: "120" },
  ];
  const painel = {
    atualizacao: { hora: "10:30:05", turno: 1, apuracao_total: "45,32%", encerrado: false, data: "04/10/2026" },
    total: { c: cands("47,21%", "43,08%") },
    municipios: { "3509502": { nm: "CAMPINAS", ua: "60,00%", c: cands("41,00%", "50,10%") } },
  };
  let falhas = 0;
  const br = boletinsPainelG1(painel, "", municipios);
  const b = br[0];
  if (!b || b.extraido.pctApurado !== 45.32 || b.extraido.pt !== 47.21 || b.extraido.bolso !== 43.08 || b.publicadoEm !== "2026-10-04T13:30:05.000Z") {
    falhas++;
    console.log("✗ painel g1 Brasil", JSON.stringify(br));
  }
  if (municipios.length) {
    const mun = boletinsPainelG1(painel, "Campinas", municipios)[0];
    if (!mun || mun.extraido.escopo?.mun !== "62910" || mun.extraido.pctApurado !== 60 || mun.extraido.bolso !== 50.1) {
      falhas++;
      console.log("✗ painel g1 Campinas", JSON.stringify(mun));
    }
  }
  const zerado = boletinsPainelG1({ ...painel, atualizacao: { ...painel.atualizacao, apuracao_total: "0,00%" } }, "", municipios);
  if (zerado.length) {
    falhas++;
    console.log("✗ painel g1 zerado deveria ser omitido");
  }
  console.log(`painel g1: ${falhas ? "FALHOU" : "ok"} — ${b?.titulo ?? ""}`);
  return falhas === 0;
}

async function live() {
  const { buscarBoletins } = await import("../../src/lib/news/fetch");
  const q = process.env.Q ?? "";
  console.log(`\n=== Rodada ao vivo (q="${q}") ===`);
  const t0 = Date.now();
  const res = await buscarBoletins({ q });
  console.log(`tempo: ${Date.now() - t0} ms — ${res.itens.length} itens`);
  for (const f of res.fontes) {
    console.log(`  ${f.ok ? "OK " : "ERR"} ${f.id.padEnd(10)} ${String(f.itens).padStart(3)} itens  ${f.nome}${f.erro ? "  ! " + f.erro : ""}`);
  }
  const porTipo: Record<string, number> = {};
  for (const i of res.itens) porTipo[i.tipo] = (porTipo[i.tipo] ?? 0) + 1;
  console.log("por tipo:", porTipo);
  console.log("\n-- 10 primeiros --");
  for (const i of res.itens.slice(0, 10)) {
    const x = i.extraido;
    console.log(
      `[${i.publicadoEm ?? "?"}] ${i.fonteNome} | ${i.tipo} | ${i.titulo}\n     apur=${fmtNum(x.pctApurado)} pt=${fmtNum(x.pt)} bolso=${fmtNum(x.bolso)} escopo=${x.escopo?.nome}  ${i.url.slice(0, 90)}`,
    );
  }
  const comNumeros = res.itens.filter((i) => i.extraido.pt !== undefined || i.extraido.bolso !== undefined || i.extraido.pctApurado !== undefined);
  console.log(`\n-- com números (${comNumeros.length}) --`);
  for (const i of comNumeros.slice(0, 25)) {
    const x = i.extraido;
    console.log(`  ${i.tipo.padEnd(12)} apur=${fmtNum(x.pctApurado)} pt=${fmtNum(x.pt)} bolso=${fmtNum(x.bolso)} [${x.escopo?.nome}] ${i.fonteNome}: ${i.titulo}`);
  }
  const exterior = res.itens.filter((i) => i.extraido.escopo?.uf === "zz");
  const comVencedor = exterior.filter((i) => i.extraido.vencedor);
  console.log(`
-- exterior (${exterior.length}; ${comVencedor.length} com vencedor) --`);
  for (const i of exterior.slice(0, 40)) {
    const x = i.extraido;
    console.log(`  [${x.escopo?.nome}] venc=${x.vencedor ?? "—"} pt=${fmtNum(x.pt)} bolso=${fmtNum(x.bolso)} | ${i.fonteNome}: ${i.titulo}`);
  }
  if (!q && exterior.length === 0) {
    console.log("✗ nenhum boletim do exterior na rodada ao vivo");
    process.exitCode = 1;
  }
}

(async () => {
  let ok = true;
  if (rodarUnit) {
    const a = unit();
    const b = await unitPainel();
    const c = await unitAgregador();
    ok = a && b && c;
  }
  if (rodarLive) await live();
  if (!ok) process.exitCode = 1;
})();
