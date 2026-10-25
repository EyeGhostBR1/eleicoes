// Extração de números de boletins da imprensa (manchetes/resumos em português).
// PURO e isomórfico: roda no servidor e no navegador (sem APIs do Node).
import { UFS, UF_POR_SIGLA } from "../config";
import { listaPaises, paisDaCidade } from "../exterior/paises";
import type { BlocoId, EscopoBoletim, MunicipioTuple, NumerosBoletim, TipoBoletim } from "../types";

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/** Remove acentos (mantém maiúsculas/minúsculas). */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normaliza para busca: sem acento, minúsculo, espaços simples. */
export function normalizarBusca(s: string): string {
  return semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Prepara o texto: troca caracteres "especiais" por equivalentes de 1 caractere
 * (º → o, aspas curvas, espaço não separável, ％ → %), remove acentos.
 * Retorna duas versões com o MESMO comprimento (posições compatíveis).
 */
function preparar(texto: string): { base: string; low: string; orig: string } {
  const orig = (texto || "")
    .normalize("NFC")
    .replace(/[\u00a0\u2007\u202f\t\r\n]/g, " ")
    .replace(/[\u00ba\u00b0]/g, "o")
    .replace(/\u00aa/g, "a")
    .replace(/[\u2018\u2019\u00b4`]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\uff05/g, "%");
  const t = semAcento(orig);
  // `orig` (com acentos) só é usado quando tem o mesmo comprimento (texto NFC comum → posições iguais)
  return { base: t, low: t.toLowerCase(), orig: orig.length === t.length ? orig : "" };
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

const RE_BOCA = /\bboca[\s-]+de[\s-]+urna\b/;
const RE_PESQUISA =
  /\b(?:pesquisas?|levantamento(?!\s+(?:d[oa]\s+)?(?:g1|estadao|folha|uol|cnn|poder360|tse|r7|terra|metropoles|band|jovem pan)\b)|intenc(?:ao|oes) de votos?|datafolha|quaest|atlas\s?intel|atlas|ipec|ibope|parana pesquisas|ipespe|poderdata|mda|cnt\/mda|real time big data|vox populi|genial\/quaest|nexus|ipsos|gerp|futura(?:\/apex)?(?=\s*[:,])|agregador(?:es)? de pesquisas?|media (?:de|das) pesquisas|sondagem|margem de erro|empate tecnico|cenario de (?:1o|2o|primeiro|segundo) turno|simulacao de (?:1o|2o|primeiro|segundo) turno|entrevistados?)\b/;
// sinais fortes de apuração (vencem o vocabulário de pesquisa)
const RE_APURACAO_FORTE =
  /\b(?:(?:urnas|secoes|votos) (?:ja )?(?:apuradas|apurados|totalizadas|totalizados|contabilizad[oa]s)|apurad[oa]s?\b|totalizad[oa]s?\b|apuracao (?:em|chega|atinge|alcanca|passa|ultrapassa)|resultados? parcia(?:l|is)|parcial (?:do|da) (?:tse|apuracao)|tse divulga|boletins? de urna|apuracao (?:no|do|dos|nos) (?:exterior|brasil|pais|estados?)|com \d{1,3}(?:[.,]\d+)?\s?% das (?:urnas|secoes))/;
const RE_APURACAO_FRACO =
  /\b(?:apuracao|apurac(?:ao|oes)|totalizacao|parcial|parciais|resultados?|placar|tse divulga|contagem de votos|votos? contados?|eleito|eleita|reeleito|reeleita|(?:vai|vao|segue|seguem|avanca|avancam|passa|passam|disputam|disputarao|disputara|decidem|decidirao|levam) (?:para o |pro |ao |o |a )?(?:2o|segundo) turno|(?:2o|segundo) turno entre)\b/;
const RE_BOCA_CRIME =
  /\b(?:crimes?|denuncias?|denunciad[oa]s?|pres[oa]s?|prende|prendem|prendeu|detid[oa]s?|detencao|detencoes|flagrante|multad[oa]s?|prisao|prisoes|policia|pm|pmdf|pf|ocorrencias?|apreend\w*|santinhos?|derrame|conduzid[oa]s?|delegacia|propaganda irregular)\b/;
const RE_VITORIA = /\b(?:vence|venceu|vencem|lidera|liderava|leva|levou|a frente|na frente|sai na frente|ganha|ganhou|vitoria|derrota|vantagem)\b/;

/** Classifica o conteúdo do boletim. */
export function classificarBoletim(texto: string): TipoBoletim {
  // condicionais ("caso seja reeleito") e "apurado" no sentido de investigação ("casos serão apurados")
  // não indicam resultado
  const low = preparar(texto)
    .low.replace(/\b(?:caso (?:seja|fosse)|se (?:for|fosse)|seja|for|fosse|caso|se)\s+(?:re)?eleit[oa]s?\b/g, " ")
    .replace(/\b(?:serao|sera|serem|ser|sendo|vao ser|vai ser|devem ser|deve ser|precisam ser|precisa ser)\s+apurad[oa]s?\b/g, " ");
  // "boca de urna" também é o crime eleitoral (propaganda no dia da votação)
  if (RE_BOCA.test(low)) return RE_BOCA_CRIME.test(low) && !/%/.test(low) ? "outro" : "boca-de-urna";
  if (RE_APURACAO_FORTE.test(low)) return "apuracao";
  if (RE_PESQUISA.test(low)) return "pesquisa";
  if (RE_APURACAO_FRACO.test(low)) return "apuracao";
  // "urnas" só conta como apuração com números/vitória (evita "eleitores vão às urnas")
  if (/\burnas?\b/.test(low) && (/%/.test(low) || RE_VITORIA.test(low))) return "apuracao";
  // "Lula vence na China" — resultado de seções (exterior/estados)
  if (/\b(?:lula|flavio|bolsonaro)\b/.test(low)) {
    if (RE_VITORIA_CANDIDATO.test(low) && /\b(?:em|no|na|nos|nas)\b/.test(low)) return "apuracao";
    // "Flávio leva Japão", "Austrália e Malásia dão vitória a Lula"
    if (/\b(?:leva|levou|vence|venceu|ganha|ganhou|lidera|vitoria)\b/.test(low) && mencionaPais(texto)) return "apuracao";
  }
  return "outro";
}

const RE_VITORIA_CANDIDATO =
  /\b(?:vence|venceu|vencem|ganha|ganhou|lidera|escolhe|escolhem|escolheram|reeleito|sai na frente|fica em 1o|fica em primeiro|fica na frente|leva a melhor|larga na frente|mais votado|dao vitoria|da vitoria|vitoria de|vitoria do|(?:supera|superou|bate|bateu|derrota|derrotou)\s+(?:o\s+)?(?:lula|flavio|bolsonaro))\b/;

/** O texto cita um país estrangeiro ("na China", "nos EUA", "Flávio leva Japão"). */
function mencionaPais(texto: string): boolean {
  const { base, low } = preparar(texto);
  const nomeLow = low.replace(/[-'’]/g, " ");
  RE_PAIS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_PAIS.exec(nomeLow))) {
    if (/[A-Z]/.test(base[m.index + m[0].length - m[1].length] ?? "")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Entidades (nomes) e porcentagens
// ---------------------------------------------------------------------------

type Tipo = "pt" | "bolso" | "outro";
interface Ent {
  start: number;
  end: number;
  tipo: Tipo;
}
interface Pct {
  start: number;
  end: number;
  valor: number;
}

/** Outros nomes/termos que "seguram" porcentagens que não são de Lula/Flávio. */
const OUTROS_NOMES = [
  // presidenciáveis e políticos 2026 / anos anteriores
  "tarcisio",
  "tarcisio de freitas",
  "ciro gomes",
  "ciro",
  "ratinho junior",
  "ratinho jr",
  "ratinho",
  "ronaldo caiado",
  "caiado",
  "romeu zema",
  "zema",
  "fernando haddad",
  "haddad",
  "geraldo alckmin",
  "alckmin",
  "simone tebet",
  "tebet",
  "marina silva",
  "marina",
  "renan santos",
  "renan filho",
  "renan calheiros",
  "renan",
  "augusto cury",
  "cury",
  "aroldo felix",
  "aroldo",
  "guilherme boulos",
  "boulos",
  "ricardo nunes",
  "nunes marques",
  "nunes",
  "eduardo paes",
  "paes",
  "eduardo leite",
  "leite",
  "marcelo freixo",
  "freixo",
  "claudio castro",
  "castro",
  "michelle",
  "eduardo",
  "sergio moro",
  "moro",
  "joao doria",
  "doria",
  "helder barbalho",
  "helder",
  "jeronimo",
  "acm neto",
  "pablo marcal",
  "marcal",
  "kassab",
  "flavio dino",
  "dino",
  "hugo motta",
  "alcolumbre",
  "valdemar",
  "gleisi",
  "tabata",
  "nikolas",
  "damares",
  "mourao",
  "datena",
  "joao campos",
  "raquel lyra",
  "elmano",
  "daniel vilela",
  "jorginho mello",
  "mauro mendes",
  "wilson lima",
  "gusttavo lima",
  "aldo rebelo",
  "dilma",
  "jair",
  "temer",
  "padre kelmon",
  // demais presidenciáveis de 2026 (painel do g1)
  "clariana barao",
  "clariana",
  "edmilson costa",
  "hertz dias",
  "leonardo avalanche",
  "avalanche",
  "rui costa pimenta",
  "samara",
  "wilson grassi",
  "grassi",
  "soraya",
  "felipe d'avila",
  "vera lucia",
  "leo pericles",
  "sofia manzano",
  "eymael",
  "rui costa",
  "camilo santana",
  "rodrigo pacheco",
  "pacheco",
  "lira",
  "zucco",
  "zambelli",
  "michel",
  // termos genéricos
  "governo",
  "governador",
  "governadora",
  "senado",
  "senadora",
  "senador",
  "prefeito",
  "prefeita",
  "prefeitura",
  "deputado",
  "deputada",
  "brancos",
  "branco",
  "nulos",
  "nulo",
  "abstencao",
  "abstencoes",
  "comparecimento",
  "indecisos",
  "nao sabem",
  "nao souberam",
  "outros candidatos",
  "demais candidatos",
  "rejeicao",
  "margem de erro",
  "eleitorado",
  "eleitores",
];

const RE_OUTROS = new RegExp(
  "\\b(?:" +
    [...OUTROS_NOMES]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
      .join("|") +
    ")\\b",
  "g",
);

const APELIDO_NAO = new Set([
  "governo", "gestao", "vitoria", "derrota", "campanha", "eleitores", "aliados", "aliado", "votos", "voto",
  "ministro", "ministra", "vice", "candidato", "candidatura", "partido", "base", "apoio", "discurso",
  "brasil", "eleicao", "reeleicao", "era", "time", "equipe", "ministros", "pt", "terceiro", "mandato", "volta",
  "retorno", "governos", "petistas", "fala", "declaracao", "plano", "programa", "proposta", "agenda", "chegada",
]);

function acharEntidades(base: string, low: string, aceitaBolsonaroSozinho: boolean): Ent[] {
  const ents: Ent[] = [];
  const ocupado = (s: number, e: number) => ents.some((x) => s < x.end && e > x.start);
  const add = (re: RegExp, tipo: Tipo | ((m: RegExpExecArray) => Tipo)) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(low))) {
      const s = m.index;
      const e = s + m[0].length;
      if (!ocupado(s, e)) ents.push({ start: s, end: e, tipo: typeof tipo === "function" ? tipo(m) : tipo });
      if (m[0].length === 0) re.lastIndex++;
    }
  };
  // 1) Bolsonaros que NÃO são o Flávio
  add(/\b(?:jair\s+(?:messias\s+)?bolsonaro|(?:michelle|eduardo|carlos|renan|jair\s+renan)\s+bolsonaro|ex-?\s?presidente\s+(?:jair\s+)?bolsonaro)\b/g, "outro");
  add(/\bflavio\s+(?:dino|roscoe|arns|tavares|cunha|nogueira)\b/g, "outro");
  // 2) candidatos dos blocos
  add(/\b(?:o\s+)?(?:senador\s+)?flavio(?:\s+bolsonaro)?\b/g, "bolso");
  // apelidos do tipo "Cadu de Lula" / "Zé de Lula" (outros candidatos)
  const reApelido = /\b([a-z]+)\s+(?:de|do)\s+lula\b/g;
  let ma: RegExpExecArray | null;
  while ((ma = reApelido.exec(low))) {
    const ini = ma.index;
    const antes = low.slice(Math.max(0, ini - 2), ini);
    if (/[A-Z]/.test(base[ini]) && !/\d/.test(antes) && !APELIDO_NAO.has(ma[1]))
      ents.push({ start: ini, end: ini + ma[0].length, tipo: "outro" });
  }
  add(/\b(?:luiz\s+inacio(?:\s+lula)?(?:\s+da\s+silva)?|lula(?:\s+da\s+silva)?)\b/g, "pt");
  // 3) "Bolsonaro" sozinho — só em contexto de apuração/boca de urna de 2026
  add(/\bbolsonaro\b/g, aceitaBolsonaroSozinho ? "bolso" : "outro");
  // "o petista" / "do petista" = Lula em texto da disputa presidencial (cita Lula/Flávio/presidente, não cita
  // governo/Senado/prefeitura nem outro petista): "Flávio tem 43,1%, contra 47,2% do petista"; "petista Fulano" não conta
  if (
    /\b(?:lula|flavio|presiden\w*)\b/.test(low) &&
    !/\b(?:governador\w*|governo d[aoe]s?|senado|senador\w*|prefeit\w*|deputad\w*)\b/.test(low) &&
    !RE_OUTROS_PETISTAS.test(low)
  ) {
    const re = /\b(?:o|do|ao|pelo|para o|contra o)\s+(?:presidente\s+e\s+candidato\s+|candidato\s+)?(petista)\b/g;
    let mp: RegExpExecArray | null;
    while ((mp = re.exec(low))) {
      const s = mp.index + mp[0].length - mp[1].length;
      const e = mp.index + mp[0].length;
      if (/^\s+[A-Z]/.test(base.slice(e, e + 3)) || ents.some((x) => s < x.end && e > x.start)) continue;
      ents.push({ start: s, end: e, tipo: "pt" });
    }
  }
  // 4) outros nomes/termos
  add(RE_OUTROS, "outro");
  // 5) aposto "Tebet, ministra de Lula, tem 3%" / "Flávio, filho de Bolsonaro, tem 44%":
  //    o nome no aposto é transparente (não recebe nem bloqueia porcentagens)
  return ents
    .filter((e) => e.tipo === "outro" || !RE_APOSTO_ANTES.test(low.slice(Math.max(0, e.start - 40), e.start)))
    .sort((a, b) => a.start - b.start);
}

const RE_OUTROS_PETISTAS =
  /\b(?:haddad|jeronimo|elmano|fatima bezerra|rafael fonteles|wellington dias|camilo|rui costa|gleisi|benedita|humberto costa|jaques wagner|paulo pimenta|marilia arraes|teresa leitao|rogerio carvalho|fabiano contarato|paulo teixeira)\b/;
const RE_APOSTO_ANTES =
  /\b(?:ex-?\s?)?(?:ministr[oa]s?|aliad[oa]s?|adversari[oa]s?|rival|rivais|vice|apoiador(?:a|es)?|apoiad[oa]s?|afilhad[oa]s?|herdeir[oa]s?|filh[oa]s?|esposa|mulher|marido|irmao|irma|correligionari[oa]s?|opositor(?:a|es)?|indicad[oa]s?|candidat[oa]s? apoiad[oa]s?)\s+(?:de|do|da|por|pelo)\s+(?:(?:ex-?\s?)?presidente\s+|senador\s+)?$/;

// sem lookbehind (Safari < 16.4 não suporta): o caractere anterior é capturado no grupo 1
const RE_PCT = /(^|[^\d.,])(\d{1,3}(?:[.,]\d{1,4})?)\s?(?:%|por\s?cento\b)/g;

function acharPcts(low: string): Pct[] {
  const out: Pct[] = [];
  RE_PCT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_PCT.exec(low))) {
    const valor = Number(m[2].replace(",", "."));
    if (!isFinite(valor)) continue;
    const start = m.index + m[1].length;
    out.push({ start, end: m.index + m[0].length, valor });
  }
  return out;
}

/** Índice de "oração" de cada posição (separadores: ; | . ! ? — e quebras). */
function oracoes(low: string, juntarNao = false): Int32Array {
  // `juntarNao`: a resposta "? Não, …" continua a oração da pergunta ("Flávio vence na Austrália? Não, Lula vence")
  // — usado só para ligar o vencedor ao lugar
  const idx = new Int32Array(low.length + 1);
  let c = 0;
  for (let i = 0; i < low.length; i++) {
    idx[i] = c;
    const ch = low[i];
    const prox = low[i + 1] ?? " ";
    if (ch === "?" && juntarNao && /^\s*nao\b/.test(low.slice(i + 1, i + 8))) continue;
    if (ch === ";" || ch === "|" || ch === "!" || ch === "?" || ch === "\u2014") c++;
    else if (ch === "." && /\s/.test(prox)) c++;
  }
  idx[low.length] = c;
  return idx;
}

/** Posição em oração interrogativa ("Lula vence no Japão? …"). */
function detectorPergunta(low: string, orac: Int32Array): (pos: number) => boolean {
  const perg = new Set<number>();
  for (let i = 0; i < low.length; i++) if (low[i] === "?") perg.add(orac[i]);
  return (pos: number) => pos >= 0 && pos < low.length && perg.has(orac[pos]);
}

const RE_APUR_DEPOIS =
  /^\s*(?:(?:d[aoe]s?\s+)?(?:(?:urnas|secoes)(?:\s+(?:eleitorais|eletronicas))?|votos|boletins(?:\s+de\s+urna)?)\s+)?(?:ja\s+)?(?:apurad|totalizad|contabilizad|processad|computad)/;
const RE_APUR_DEPOIS_2 = /^\s*(?:de|da)\s+(?:apuracao|totalizacao)\b/;
const RE_URNAS_DEPOIS = /^\s*d[ao]s\s+(?:urnas|secoes)(?:\s+(?:eleitorais|eletronicas))?\b(.{0,20})/;
const RE_URNAS_NUA = /^\s*(?:$|[,;.:)!?\u2014-]|e\b|com\b|ja\b|no\b|na\b|nos\b|em\b|do\b|da\b|lula\b|flavio\b|bolsonaro\b)/;
const RE_APUR_ANTES =
  /(?:apuracao|totalizacao|apurad[oa]s?|totalizad[oa]s?)\s*(?::|-|em|de|com|chega a|chegou a|atinge|atingiu|alcanca|alcancou|passa de|passou de|supera|superou|ultrapassa|ultrapassou|a)?\s*(?:mais de|quase|cerca de)?\s*$/;
const RE_IGNORA_DEPOIS =
  /^\s*(?:d[aoe]s?\s+)?(?:eleitor|eleitorado|entrevistados|abstenc|comparecimento|brancos|nulos|rejeicao|vantagem|diferenca|pontos|margem|de erro|a mais|a menos|acima|abaixo|das intencoes de voto para (?:o\s+)?(?:governo|senado)|(?:municipios|cidades|estados|capitais|ufs|zonas|paises|regioes|bairros|distritos)\b)/;
const RE_IGNORA_ANTES =
  /(?:vantagem|diferenca|margem|cresce|cresceu|caiu|cai|subiu|sobe|oscila|oscilou|rejeicao|variacao|abstencao|comparecimento|brancos|nulos|de erro|aumento|queda|alta|crescimento)\s*(?:de|em|:|para)?\s*(?:ate|apenas|so|quase|cerca de|mais de)?\s*$/;
const RE_HIST_DEPOIS =
  /^\s*[,(]?\s*(?:(?:no|na|nos|nas|em)\s+(?:(?!e\b)[a-z]+\s+){1,3}?)?(?:(?:em|no|na|do|da|de)\s+)?(?:(?:o\s+)?(?:1o|2o|primeiro|segundo)\s+turno\s+(?:de|em)\s+)?(?:20(?:18|22)|eleicao passada|eleicao anterior|ultima eleicao)\b/;
const RE_FRENTE_EXPLICITA =
  /^\s*(?:(?:dos|de)\s+(?:votos(?:\s+validos)?|validos)\s*)?,?\s*(?:para|pra|de|do|da|a favor de|em favor de|ao)\s+(?:o\s+|a\s+|ex-presidente\s+|presidente\s+|candidato\s+|petista\s+)?$/;
const RE_FRENTE_NUA = /^\s*[x\u00d7]?\s*$/;
const RE_ENTRE_BLOQUEIA =
  /\b(?:vantagem|diferenca|margem|rejeicao|rejeitad[oa]|cresce|cresceu|caiu|subiu|oscilou|abstencao|comparecimento|urnas|secoes|aprovad[oa]|desaprovad[oa]|reprovad[oa]|aprovam|desaprovam|reprovam|aprova|desaprova|reprova|aprovacao|desaprovacao|reprovacao|avaliacao|avaliad[oa]|popularidade|confianca|nao votariam?|nao votam?)\b|\b(?:apurad|totalizad)/;
const RE_ANTES_ENT_BLOQUEIA =
  /(?:aprovacao|desaprovacao|rejeicao|avaliacao|governo|gestao|confianca|popularidade|\bcita|\bcitou|\bcitam|\bmenciona|\bmencionou|\bmencionam)\s+(?:do\s+governo\s+)?(?:de|do|da|a|ao|o)?\s*(?:presidente\s+)?$/;
const RE_PARA_CANDIDATO =
  /^\s*(?:dos votos(?:\s+validos)?\s*)?,?\s*(?:para|pra|a favor de|em favor de)\s+(?:o\s+)?(?:(?:ex-?\s?)?presidente\s+|candidato\s+|petista\s+|senador\s+)?(?:lula|luiz|flavio|bolsonaro)\b/;
const RE_FALTA_ANTES =
  /\b(?:faltam|falta|faltando|restam|resta|restando)(?:\s+(?:para\s+)?(apurar|totalizar|ser(?:em)?\s+(?:apurad|totalizad)[oa]s?))?\s*(?:apenas|so|somente|cerca de|menos de|pouco mais de)?\s*$/;
const RE_VERBO_PASSADO =
  /\b(?:teve|tinha|tiveram|tinham|obteve|obtiveram|recebeu|receberam|somou|somaram|registrou|registraram|fez|fizeram|alcancou|conquistou|ficou|ficaram|marcou|venceu|ganhou|perdeu|foi|chegou|terminou)\b/;
/** "47% dos votos/das intenções/do total…" — complementos que indicam % de votos */
const PCT_DE_VOTOS = new Set([
  "voto", "votos", "validos", "valido", "intencoes", "intencao", "preferencia", "preferencias", "total", "totais",
  "mencoes", "citacoes", "apoio", "eleitorado", "urnas", "secoes", "boletins",
]);
const RE_VOTOS_APURADOS = /^\s*dos\s+votos\s+(?:ja\s+)?(?:apurad|totalizad|contabilizad)/;

// ---------------------------------------------------------------------------
// Escopo (Brasil / UF / município / exterior)
// ---------------------------------------------------------------------------

const SIGLAS = UFS.filter((u) => u.sigla !== "zz").map((u) => u.sigla.toUpperCase());
const NOMES_UF: { sigla: string; nome: string }[] = [
  ...UFS.filter((u) => u.sigla !== "zz").map((u) => ({ sigla: u.sigla, nome: semAcento(u.nome).toLowerCase() })),
  { sigla: "mg", nome: "minas" },
  { sigla: "rj", nome: "rio" },
].sort((a, b) => b.nome.length - a.nome.length);

const CAPITAIS: Record<string, string> = {
  ac: "rio branco",
  al: "maceio",
  ap: "macapa",
  am: "manaus",
  ba: "salvador",
  ce: "fortaleza",
  df: "brasilia",
  es: "vitoria",
  go: "goiania",
  ma: "sao luis",
  mt: "cuiaba",
  ms: "campo grande",
  mg: "belo horizonte",
  pa: "belem",
  pb: "joao pessoa",
  pr: "curitiba",
  pe: "recife",
  pi: "teresina",
  rj: "rio de janeiro",
  rn: "natal",
  rs: "porto alegre",
  ro: "porto velho",
  rr: "boa vista",
  sc: "florianopolis",
  sp: "sao paulo",
  se: "aracaju",
  to: "palmas",
};

const GENTILICO_CAPITAL: Record<string, string> = {
  paulista: "sp",
  paulistana: "sp",
  fluminense: "rj",
  carioca: "rj",
  mineira: "mg",
  baiana: "ba",
  gaucha: "rs",
  pernambucana: "pe",
  cearense: "ce",
  paranaense: "pr",
  catarinense: "sc",
  goiana: "go",
  paraense: "pa",
  amazonense: "am",
  maranhense: "ma",
  piauiense: "pi",
  potiguar: "rn",
  paraibana: "pb",
  alagoana: "al",
  sergipana: "se",
  capixaba: "es",
  "mato-grossense": "mt",
  "sul-mato-grossense": "ms",
  tocantinense: "to",
  rondoniense: "ro",
  roraimense: "rr",
  amapaense: "ap",
  acreana: "ac",
  federal: "df",
};

/** Nomes de municípios que são palavras comuns — exigem "cidade de"/"(UF)". */
const MUN_PALAVRA_COMUM = new Set([
  "vitoria",
  "esperanca",
  "serra",
  "bonito",
  "central",
  "uniao",
  "paulista",
  "liberdade",
  "independencia",
  "progresso",
  "alianca",
  "harmonia",
  "concordia",
  "alvorada",
  "cachoeira",
  "primavera",
  "socorro",
  "planalto",
  "bandeirantes",
  "formosa",
  "jardim",
  "paraiso",
  "presidente",
  "governador",
  "eleicao",
  "pedra",
  "ouro",
  "areia",
  "barra",
  "brejo",
  "lagoa",
  "mundo novo",
  "santa luzia",
  "sao jose",
  "bom jesus",
  "triunfo",
  "carmo",
  "piedade",
  "poco",
  "agua",
  "campos",
  "tupa",
  "ipe",
  "ita",
  "luz",
  "palmeira",
  "vista",
  "candido",
  "flores",
  "campo",
  "porto",
]);

/** Apelidos usuais de municípios → [uf, nome normalizado]. */
const ALIAS_MUN: Record<string, [string, string]> = {
  "sao bernardo": ["sp", "sao bernardo do campo"],
  "santo andre": ["sp", "santo andre"],
  "campos": ["rj", "campos dos goytacazes"],
};

// --- exterior: países (src/lib/exterior/paises-data.ts) e cidades com seção eleitoral (uf "zz") ---

/** Apelidos de países usados pela imprensa → nome como em paises-data.ts (ignorado se o país não existir lá). */
const ALIAS_PAIS: Record<string, string> = {
  eua: "Estados Unidos",
  "estados unidos da america": "Estados Unidos",
  holanda: "Países Baixos",
  inglaterra: "Reino Unido",
  escocia: "Reino Unido",
  "gra bretanha": "Reino Unido",
  coreia: "Coreia do Sul",
  cingapura: "Singapura",
  kuaite: "Kuwait",
  barein: "Bahrein",
  bahrain: "Bahrein",
  "republica checa": "República Tcheca",
  tchequia: "República Tcheca",
  chequia: "República Tcheca",
  vietname: "Vietnã",
  vietnam: "Vietnã",
  irao: "Irã",
  emirados: "Emirados Árabes Unidos",
  "emirados arabes": "Emirados Árabes Unidos",
  dubai: "Emirados Árabes Unidos",
  timor: "Timor-Leste",
  myanmar: "Mianmar",
  birmania: "Mianmar",
  bosnia: "Bósnia e Herzegovina",
  trinidad: "Trinidad e Tobago",
  "costa do marfim": "Costa do Marfim",
};

/** Grafias alternativas de cidades do exterior → nome TSE normalizado. */
const ALIAS_CIDADE_EXT: Record<string, string> = {
  "nova iorque": "nova york",
  "nova deli": "nova delhi",
  "cidade do mexico": "mexico",
  nagoya: "nagoia",
  taipei: "taipe",
  bangcoc: "bangkok",
  beijing: "pequim",
  shanghai: "xangai",
  guangzhou: "cantao",
  seoul: "seul",
  "washington dc": "washington",
  kyiv: "kiev",
  "abu dabi": "abu dhabi",
  canberra: "camberra",
  sidnei: "sydney",
  zurich: "zurique",
};

/** Cidades do exterior cujo nome é palavra comum/sobrenome — só com contexto de exterior. */
const EXT_PALAVRA_COMUM = new Set(["lima", "praia", "lagos", "rivera", "artigas", "chuy", "porto", "faro", "colombo"]);

function normNomeMun(s: string): string {
  return semAcento(s).toLowerCase().replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();
}

const PAISES_LISTA: string[] = listaPaises();
/** nome normalizado (ou apelido) → nome do país em pt-BR */
const PAIS_POR_NOME = new Map<string, string>();
for (const p of PAISES_LISTA) PAIS_POR_NOME.set(normNomeMun(p), p);
for (const [a, p] of Object.entries(ALIAS_PAIS)) if (PAISES_LISTA.includes(p) && !PAIS_POR_NOME.has(a)) PAIS_POR_NOME.set(a, p);

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NOMES_PAIS_RE = [...PAIS_POR_NOME.keys()]
  .sort((a, b) => b.length - a.length)
  .map((n) => escRe(n).replace(/ /g, "\\s+"))
  .join("|");
// "na China", "nos EUA", "em Portugal", "(Uruguai)", "Flávio leva (o) Japão", "Austrália, Nova Zelândia… dão vitória a Lula"
const PREP_PAIS =
  "em|no|na|nos|nas|de|do|da|dos|das|pelo|pela|pelos|pelas|ao|aos|para o|para a|para os|para as|entre|" +
  "(?:leva|levou|vence|venceu|ganha|ganhou|conquista|conquistou|domina|dominou|vira|virou)(?:\\s+(?:o|a|os|as))?";
const RE_PAIS = new RegExp(`(?:\\b(?:${PREP_PAIS})\\s+|\\(\\s*|(?:^|[:|\\u2014])\\s*)(${NOMES_PAIS_RE})\\b`, "g");

/** "no exterior" (o total do exterior) */
const RE_GENERICO_EXTERIOR: RegExp[] = [
  /\b(?:no|do|ao|pelo|para o|o|os)\s+exterior\b/g,
  /\bfora do (?:brasil|pais)\b/g,
  /\bbrasileiros que (?:vivem|moram) fora\b/g,
  // rótulo no início: "Exterior: Lula tem 52%…", "EXTERIOR — Flávio lidera"
  /^\s*exterior\b(?=\s*[:|—–-])/g,
];
/**
 * Pista de que a cidade citada é homônima nos EUA ("Paris (TX)", "Paris, Texas"): se a cidade do TSE não fica
 * nos EUA, a menção não é dela. Siglas que também são UFs brasileiras (AL, MA, MS, MT, PA, SC) ficam de fora.
 */
const SIGLAS_EUA =
  "AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MI|MN|MO|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|RI|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";
const RE_PISTA_EUA_SIGLA = new RegExp(`^\\s*(?:\\(\\s*(?:${SIGLAS_EUA})\\s*\\)|,\\s*(?:TX|CA|FL|NY|NJ|IL|KY|TN|AZ|NV|GA|OH)(?![A-Za-z]))`);
const RE_PISTA_EUA_NOME =
  /^\s*(?:\(\s*|,\s*(?:(?:no|na|em)\s+)?)(?:texas|california|florida|kentucky|tennessee|illinois|ohio|maine|georgia|virginia|indiana|michigan|missouri|arkansas|idaho|wisconsin|alabama|carolina do (?:norte|sul)|oklahoma|nevada|arizona|oregon)\b/;
/** "em seis países", "na Ásia": parte do exterior — escopo Exterior, mas sem vencedor ligado a ele */
const RE_GENERICO_REGIAO: RegExp[] = [
  /\b(?:em|nos|de|dos|entre)\s+(?:[a-z0-9]+\s+){0,3}?(?:paises|consulados|embaixadas)\b/g,
  // ("América Latina/do Sul" fica de fora: aparece em análise política, não em resultado no exterior)
  /\b(?:na|da|pela|a)\s+(?:asia|europa|africa|oceania|america do norte)\b/g,
  /\b(?:no|do)\s+oriente medio\b/g,
];
/** "eleitores do Japão", "votos da China", "brasileiros dos EUA", "seções de Portugal", "resultado da Itália" */
const RE_ANTES_GENITIVO =
  /\b(?:votos?|votacao|eleitores|eleitorado|brasileiros|urnas?|secoes|secao|resultados?|parcial|parciais|apuracao|boletins?(?:\s+de\s+urna)?|consulados?|embaixadas?|comunidade|vitoria|lideranca|vencedor|eleicao|eleicoes|cidades|regioes|provincias|estados)(?:\s+[a-z]+)?\s*$/;
/** Só considera países/cidades estrangeiras em texto sobre a votação ("presidente da França visita…" não conta). */
const RE_CONTEXTO_ELEITORAL =
  /\b(?:venc\w*|ganh\w*|lider\w*|leva|levou|perde|perdeu|derrota\w*|escolhe\w*|vitoria|frente|mais votado|(?:supera|superou|bate|bateu)\s+(?:o\s+)?(?:lula|flavio|bolsonaro)|votos?|votacao|votaram|votam|vota|votou|urnas?|eleic\w+|eleitor\w*|apurac\w+|apurad\w+|boletins?|secoes|secao|turno|resultados?|exterior|consulados?|embaixadas?|brasileiros)\b|\d\s?%/;

interface IndiceMun {
  /** municípios brasileiros (sem "zz") */
  porNome: Map<string, MunicipioTuple[]>;
  porUfNome: Map<string, MunicipioTuple>;
  /** cidades do exterior (uf "zz"), inclusive apelidos */
  ext: Map<string, MunicipioTuple>;
  maxPalavras: number;
}
const cacheIndice = new WeakMap<MunicipioTuple[], IndiceMun>();

function indiceMunicipios(lista: MunicipioTuple[]): IndiceMun {
  const c = cacheIndice.get(lista);
  if (c) return c;
  const porNome = new Map<string, MunicipioTuple[]>();
  const porUfNome = new Map<string, MunicipioTuple>();
  const ext = new Map<string, MunicipioTuple>();
  let maxPalavras = 1;
  for (const t of lista) {
    if (!t || !t[1]) continue;
    const n = normNomeMun(t[1]);
    maxPalavras = Math.max(maxPalavras, n.split(" ").length);
    if (t[2] === "zz") {
      if (!ext.has(n)) ext.set(n, t);
      continue;
    }
    const arr = porNome.get(n);
    if (arr) arr.push(t);
    else porNome.set(n, [t]);
    porUfNome.set(t[2] + "|" + n, t);
  }
  for (const [a, n] of Object.entries(ALIAS_CIDADE_EXT)) {
    const t = ext.get(n);
    if (t && !ext.has(a)) ext.set(a, t);
  }
  const idx = { porNome, porUfNome, ext, maxPalavras: Math.min(maxPalavras, 7) };
  cacheIndice.set(lista, idx);
  return idx;
}

function escopoBr(): EscopoBoletim {
  return { tipo: "br", nome: "Brasil" };
}
function escopoUf(uf: string): EscopoBoletim {
  return { tipo: "uf", uf, nome: UF_POR_SIGLA[uf]?.nome ?? uf.toUpperCase() };
}
function escopoMun(t: MunicipioTuple): EscopoBoletim {
  if (t[2] === "zz") {
    const p = paisDaCidade(t[0]);
    return { tipo: "mun", uf: "zz", mun: t[0], nome: `${t[1]} (${p ? p.pais : "Exterior"})` };
  }
  return { tipo: "mun", uf: t[2], mun: t[0], nome: `${t[1]} (${t[2].toUpperCase()})` };
}
function escopoPais(pais: string): EscopoBoletim {
  return { tipo: "pais", uf: "zz", pais, nome: `${pais} (exterior)` };
}
function escopoExterior(): EscopoBoletim {
  return { tipo: "uf", uf: "zz", nome: "Exterior" };
}

/** Escopo detectado + posição da menção ao lugar no texto (-1 = Brasil presumido). */
interface Deteccao {
  escopo: EscopoBoletim;
  ini: number;
  fim: number;
  /** escopo vindo de "em seis países"/"na Ásia": não liga vencedor ("Lula vence em países da Ásia") */
  semVencedor?: boolean;
}

interface MencaoUf {
  start: number;
  end: number;
  uf: string;
}

function acharUfs(base: string, low: string, orig: string): MencaoUf[] {
  const out: MencaoUf[] = [];
  const ocupado = (s: number, e: number) => out.some((x) => s < x.end && e > x.start);
  // "na Grande São Paulo" (região metropolitana) conta como a UF
  const prep = "(?:em|no|na|nos|nas|do|da|de|pelo|pela|ao|para o|para a|estado de|estado do|estado da)(?:\\s+grande)?";
  for (const { sigla, nome } of NOMES_UF) {
    const padrao = nome.replace(/ /g, "\\s+");
    // "Rio" sozinho só com artigo "no/do/ao Rio" e sem complemento de outro nome
    // locativo ("em São Paulo", "no Rio Grande do Sul") ou rótulo no início ("Bahia: Lula tem…")
    // "Paraná Pesquisas" é instituto, não UF
    const re =
      nome === "rio"
        ? /\b(?:no|do|ao|pelo)\s+(rio)\b(?!\s+(?:grande|de\s+janeiro|branco|negro|claro|verde|bonito|pardo|preto|largo|doce|azul|novo|sao|das?|dos?|tiete|amazonas))/g
        : new RegExp(`(?:\\b${prep}\\s+|^\\s*)(${padrao})\\b(?!\\s+(?:de|do|da|dos|das)\\s+[A-Za-z]|\\s+pesquisas?\\b)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(low))) {
      const s = m.index + m[0].length - m[1].length;
      const e = m.index + m[0].length;
      // exige inicial maiúscula no texto original (evita a preposição "para" ≠ Pará)
      if (!/[A-Z]/.test(base[s])) continue;
      // "Para Lula, …" (início de frase) ≠ Pará: sem o acento, só com artigo masculino ("no/do/ao Pará")
      if (nome === "para") {
        const acentuado = orig ? /[áÁ]/.test(orig[e - 1] ?? "") : false;
        if (!acentuado && !/^(?:no|do|ao|pelo|para o|estado do)\s/.test(m[0])) continue;
      }
      if (ocupado(s, e)) continue;
      out.push({ start: s, end: e, uf: sigla });
    }
  }
  // siglas: "em SP", "no RJ", "(MG)"
  const siglas = SIGLAS.join("|");
  const reSig = new RegExp(
    `(?:\\b(?:[Ee][Mm]|[Nn][OoAa][Ss]?|[Dd][OoAaEe]|[Pp][Ee][Ll][OoAa]|[Pp]ara\\s+[oa])\\s+|\\()(${siglas})(?![A-Za-z0-9-])`,
    "g",
  );
  // "Atlas PR: Flávio tem…" / "Datafolha SP: …"
  const reSigDoisPontos = new RegExp(`(^|[^A-Za-z0-9-])(${siglas})\\s*:`, "g");
  let m: RegExpExecArray | null;
  while ((m = reSig.exec(base))) {
    const s = m.index + m[0].length - m[1].length;
    const e = s + m[1].length;
    if (m[0].startsWith("(") && base[e] !== ")") continue;
    if (!ocupado(s, e)) out.push({ start: s, end: e, uf: m[1].toLowerCase() });
  }
  while ((m = reSigDoisPontos.exec(base))) {
    const s = m.index + m[1].length;
    if (!ocupado(s, s + 2)) out.push({ start: s, end: s + 2, uf: m[2].toLowerCase() });
  }
  // "SP: Lula tem…" / "MG - Flávio lidera…"
  const mi = new RegExp(`^(\\s*)(${siglas})\\s*[:\\-\\u2013|]`).exec(base);
  if (mi) {
    const s = mi[1].length;
    if (!ocupado(s, s + 2)) out.push({ start: s, end: s + 2, uf: mi[2].toLowerCase() });
  }
  // sigla solta em texto de caixa mista ("Apuração de votos para Presidente SP no 1º turno");
  // não vale colada a hífen ("PL-RJ", "TRE-SP") nem em manchete toda em maiúsculas
  if (!caixaAlta(base)) {
    const reSolta = new RegExp(`(^|[^A-Za-z0-9(-])(${siglas})(?![A-Za-z0-9)-])`, "g");
    while ((m = reSolta.exec(base))) {
      const s = m.index + m[1].length;
      if (!ocupado(s, s + 2)) out.push({ start: s, end: s + 2, uf: m[2].toLowerCase() });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Texto (quase) todo em maiúsculas — siglas soltas não são confiáveis ("SE", "TO"…). */
function caixaAlta(base: string): boolean {
  const mai = (base.match(/[A-Z]/g) ?? []).length;
  const min = (base.match(/[a-z]/g) ?? []).length;
  return mai > min;
}

/** Palavras (minúsculas, sem acento) a partir de `pos`, com a posição final de cada uma. */
function lerPalavras(texto: string, pos: number, max: number): { palavras: string[]; fins: number[] } {
  const palavras: string[] = [];
  const fins: number[] = [];
  const re = /\s*([a-z0-9]+)/y;
  re.lastIndex = pos;
  let m: RegExpExecArray | null;
  while (palavras.length < max && (m = re.exec(texto))) {
    palavras.push(m[1]);
    fins.push(re.lastIndex);
  }
  return { palavras, fins };
}

/** Pista de UF brasileira logo depois de um nome: "Campinas (SP)", "Campinas-SP", "Campinas, em SP". */
function pistaUfDepois(base: string, fim: number): string | undefined {
  const depois = base.slice(fim, fim + 16);
  const md = new RegExp(
    `^\\s*(?:[-/,(]\\s*|,?\\s*(?:em|no|na|interior de|interior do)\\s+)(${SIGLAS.join("|")})(?![A-Za-z])`,
  ).exec(depois);
  return md ? md[1].toLowerCase() : undefined;
}

interface MencaoExt {
  ini: number;
  fim: number;
  tipo: "pais" | "cidade" | "exterior" | "regiao";
  pais?: string;
  cidade?: MunicipioTuple;
  /** cidade homônima de município brasileiro ou palavra comum — exige contexto de exterior */
  conflito?: boolean;
}

/**
 * Menções ao exterior: países ("na China", "nos EUA"), cidades com seção eleitoral ("em Tóquio")
 * e termos genéricos ("no exterior", "em seis países", "na Ásia").
 * Retorna o escopo escolhido (o 1º país/cidade; senão "Exterior") e a posição da 1ª menção.
 */
function acharExterior(
  base: string,
  low: string,
  orig: string,
  idx: IndiceMun | null,
  /** a posição está numa oração interrogativa ("Lula vence no Japão?") */
  pergunta?: (pos: number) => boolean,
): { det: Deteccao; primeira: number; mencoes: MencaoExt[] } | null {
  if (!RE_CONTEXTO_ELEITORAL.test(low)) return null;
  const nomeLow = low.replace(/[-'’]/g, " ");
  const mencoes: MencaoExt[] = [];
  const brasileiroMaisLongo = (pos: number): number => {
    if (!idx) return -1;
    const { palavras, fins } = lerPalavras(nomeLow, pos, idx.maxPalavras);
    for (let k = palavras.length; k >= 1; k--) if (idx.porNome.has(palavras.slice(0, k).join(" "))) return fins[k - 1];
    return -1;
  };
  const evidenciaBr = (ini: number, fim: number): boolean =>
    !!pistaUfDepois(base, fim) || /\b(?:cidade|municipio|prefeitura) de\s+$/.test(nomeLow.slice(Math.max(0, ini - 20), ini));

  // países
  const temCandidato = /\b(?:lula|flavio|bolsonaro)\b/.test(low);
  RE_PAIS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_PAIS.exec(nomeLow))) {
    const s = m.index + m[0].length - m[1].length;
    const e = m.index + m[0].length;
    if (m[0].length === 0) RE_PAIS.lastIndex++;
    if (!/[A-Z]/.test(base[s] ?? "")) continue;
    const pais = PAIS_POR_NOME.get(m[1].replace(/\s+/g, " "));
    if (!pais) continue;
    const prefixo = m[0].slice(0, m[0].length - m[1].length);
    // sem preposição ("Austrália, Nova Zelândia… dão vitória a Lula", "Japão: Flávio vence", "(Uruguai)"):
    // só em texto sobre Lula/Flávio ("Bósnia vota em eleição…" é a eleição de lá)
    if (!/[a-z]\s+$/.test(prefixo) && !temCandidato) continue;
    // genitivo ("Interesse dos EUA nas eleições…") só depois de palavra de votação ("eleitores do Japão", "votos da China")
    if (/^(?:de|do|da|dos|das)\s+$/.test(prefixo) && !RE_ANTES_GENITIVO.test(nomeLow.slice(Math.max(0, m.index - 40), m.index)))
      continue;
    // município brasileiro homônimo ou mais longo ("Colômbia (SP)", "França, em SP") → fica com o Brasil;
    // com acentos no texto, a grafia desempata ("em Franca" = Franca/SP; "na França" = país)
    const fimBr = brasileiroMaisLongo(s);
    if (fimBr > e || (fimBr === e && (evidenciaBr(s, e) || grafiaBrasileira(orig.slice(s, e), pais, idx)))) continue;
    mencoes.push({ ini: s, fim: e, tipo: "pais", pais });
  }

  // cidades do exterior
  if (idx) {
    const ler = (pos: number): { nome: string; fim: number } | null => {
      if (!/[A-Z]/.test(base[pos] ?? "")) return null;
      const { palavras, fins } = lerPalavras(nomeLow, pos, idx.maxPalavras);
      let k = palavras.length;
      while (k >= 1 && !idx.ext.has(palavras.slice(0, k).join(" "))) k--;
      return k >= 1 ? { nome: palavras.slice(0, k).join(" "), fim: fins[k - 1] } : null;
    };
    const reGat = /\b(?:em|no|na|nos|nas|pela|pelo)\s+|\(\s*/g;
    while ((m = reGat.exec(nomeLow))) {
      let pos = m.index + m[0].length;
      // "na Cidade do Cabo" (nome) × "na cidade de Tóquio" (descrição)
      let achado = ler(pos);
      const mc = achado ? null : /^cidade\s+d[eo]\s+/.exec(nomeLow.slice(pos, pos + 12));
      if (mc) {
        pos += mc[0].length;
        achado = ler(pos);
      }
      if (!achado) continue;
      const { nome, fim } = achado;
      const fimBr = brasileiroMaisLongo(pos);
      if (fimBr > fim) continue; // "Praia Grande" ≠ Praia (Cabo Verde)
      // mesmo trecho já reconhecido como país ("em Singapura", "no México") → fica o país
      if (mencoes.some((x) => x.tipo === "pais" && x.ini === pos && x.fim <= fim)) continue;
      const conflito = fimBr === fim || EXT_PALAVRA_COMUM.has(nome);
      if (conflito && evidenciaBr(pos, fim)) continue;
      const cidade = idx.ext.get(nome)!;
      // "Paris (TX)", "Paris, Texas": homônima nos EUA, não é a cidade do TSE (salvo se ela própria for dos EUA)
      if (
        (RE_PISTA_EUA_SIGLA.test(base.slice(fim, fim + 8)) || RE_PISTA_EUA_NOME.test(nomeLow.slice(fim, fim + 30))) &&
        paisDaCidade(cidade[0])?.iso2 !== "US"
      )
        continue;
      mencoes.push({ ini: pos, fim, tipo: "cidade", cidade, conflito });
    }
  }

  // "…, em Genebra e Zurique" / "…, Roma e Milão": lista de cidades do mesmo país
  const outraCidadeDoPais = (pos: number, pais: string): boolean => {
    if (!idx) return false;
    const ml = /^\s*(?:,|\s+e\s+)\s*(?:(?:em|no|na)\s+)?/.exec(nomeLow.slice(pos, pos + 12));
    if (!ml) return false;
    const ini = pos + ml[0].length;
    if (!/[A-Z]/.test(base[ini] ?? "")) return false;
    const { palavras } = lerPalavras(nomeLow, ini, idx.maxPalavras);
    for (let k = palavras.length; k >= 1; k--) {
      const t = idx.ext.get(palavras.slice(0, k).join(" "));
      if (t) return paisDaCidade(t[0])?.pais === pais;
    }
    return false;
  };

  // termos genéricos
  for (const [lista, tipo] of [
    [RE_GENERICO_EXTERIOR, "exterior"],
    [RE_GENERICO_REGIAO, "regiao"],
  ] as const) {
    for (const re of lista) {
      re.lastIndex = 0;
      while ((m = re.exec(low))) mencoes.push({ ini: m.index, fim: m.index + m[0].length, tipo });
    }
  }

  // cidades homônimas de municípios brasileiros (Rio Branco, Santiago, Buenos Aires…) ou palavras comuns
  // (Lima, Praia…) só valem com contexto de exterior no texto (país, outra cidade ou "no exterior")
  const temContexto = mencoes.some((x) => !x.conflito);
  const validas = mencoes
    .filter((x) => !x.conflito || temContexto)
    // país dentro do nome de uma cidade ("Cidade do México") → fica a cidade
    .filter((x, _i, arr) => !(x.tipo === "pais" && arr.some((y) => y.tipo === "cidade" && y.ini < x.ini && y.fim >= x.fim)))
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  if (!validas.length) return null;
  // "Lula vence no Japão? Não: Flávio lidera em Hamamatsu" — o lugar citado só na pergunta perde para o da resposta
  let usadas = validas;
  if (pergunta) {
    const fora = validas.filter((x) => !pergunta(x.ini));
    if (fora.length && fora.length < validas.length) usadas = fora;
  }

  const especificas = usadas.filter((x) => x.tipo === "pais" || x.tipo === "cidade");
  let esc = especificas[0] ?? usadas.find((x) => x.tipo === "exterior") ?? usadas[0];
  // "no Japão, em Tóquio" / "Japão (Tóquio)" → a cidade
  // (lista de cidades do país — "na Suíça, em Genebra e Zurique" — continua sendo o país)
  const prox = especificas[1];
  if (
    esc.tipo === "pais" &&
    prox?.tipo === "cidade" &&
    prox.cidade &&
    paisDaCidade(prox.cidade[0])?.pais === esc.pais &&
    /^[\s,;:()\-–]*(?:(?:em|no|na)\s+)?$/.test(nomeLow.slice(esc.fim, prox.ini)) &&
    !outraCidadeDoPais(prox.fim, esc.pais!)
  )
    esc = prox;
  const escopo =
    esc.tipo === "pais" ? escopoPais(esc.pais!) : esc.tipo === "cidade" && esc.cidade ? escopoMun(esc.cidade) : escopoExterior();
  return {
    det: { escopo, ini: esc.ini, fim: esc.fim, semVencedor: esc.tipo === "regiao" },
    primeira: usadas[0].ini,
    mencoes: validas,
  };
}

/**
 * O trecho (com acentos) é a grafia de um município brasileiro e não a do país:
 * "Franca" (SP) × "França". Sem acentos disponíveis (`orig` vazio) não decide.
 */
function grafiaBrasileira(trechoOrig: string, pais: string, idx: IndiceMun | null): boolean {
  if (!trechoOrig || !idx) return false;
  const t = trechoOrig.replace(/\s+/g, " ").toLowerCase();
  if (t === pais.toLowerCase()) return false;
  return (idx.porNome.get(normNomeMun(t)) ?? []).some((c) => c[1].toLowerCase() === t);
}

/** Escopo no Brasil (capital/município/UF), com a posição da menção. */
function detectarEscopoBr(base: string, low: string, orig: string, idx: IndiceMun | null): Deteccao | null {
  const ufs = acharUfs(base, low, orig);
  const ufsDistintas = [...new Set(ufs.map((u) => u.uf))];
  const ufContexto = ufsDistintas.length === 1 ? ufsDistintas[0] : undefined;
  const capitalDe = (uf: string): MunicipioTuple | undefined =>
    idx ? idx.porUfNome.get(uf + "|" + CAPITAIS[uf]) : undefined;
  const det = (escopo: EscopoBoletim, ini: number, fim: number): Deteccao => ({ escopo, ini, fim });
  const capitalOuUf = (uf: string, ini: number, fim: number): Deteccao => {
    const t = capitalDe(uf);
    return det(t ? escopoMun(t) : escopoUf(uf), ini, fim);
  };

  // --- capital ---
  const reCapGent = new RegExp(`\\bcapital\\s+(${Object.keys(GENTILICO_CAPITAL).join("|")})\\b`);
  const mg = reCapGent.exec(low);
  if (mg) return capitalOuUf(GENTILICO_CAPITAL[mg[1]], mg.index, mg.index + mg[0].length);
  const cidadeSP = /\b(?:cidade|capital|municipio|prefeitura)\s+(?:de\s+)?(sao paulo)\b/.exec(low);
  const cidadeRJ =
    /\b(?:cidade|capital|municipio|prefeitura)\s+(?:do\s+)?(rio)(?:\s+de\s+janeiro)?\b(?!\s+(?:grande|branco|negro|claro|verde|bonito|pardo|preto|largo|doce|azul|novo))/.exec(
      low,
    );
  if (cidadeSP || cidadeRJ) {
    const sp = !!cidadeSP && (!cidadeRJ || cidadeSP.index < cidadeRJ.index);
    const mm = (sp ? cidadeSP : cidadeRJ)!;
    return capitalOuUf(sp ? "sp" : "rj", mm.index, mm.index + mm[0].length);
  }
  const mCap = /\b(?:na|da|a|nesta|pela)\s+capital\b(?!\s+(?:federal|politica|economica|social|eleitoral))/.exec(low);
  if (mCap && ufContexto) return capitalOuUf(ufContexto, mCap.index, mCap.index + mCap[0].length);
  const mBh = /\b(?:[Ee][Mm]|[Dd][Ee]|[Nn][Aa])\s+BH\b/.exec(base);
  if (mBh) return capitalOuUf("mg", mBh.index, mBh.index + mBh[0].length);
  const mCf = /\bcapital federal\b/.exec(low);
  if (mCf) return capitalOuUf("df", mCf.index, mCf.index + mCf[0].length);

  // --- municípios ---
  if (idx) {
    const cityLow = low.replace(/[-'’]/g, " ");
    const ocupadoUf = (s: number, e: number) => ufs.some((x) => s < x.end && e > x.start);
    /** ufForte: UF citada junto ao nome ("Campinas (SP)", "Campinas, em SP") — obrigatória quando presente */
    const escolher = (nome: string, ufForte?: string, forte?: boolean, trechoOrig = ""): MunicipioTuple | undefined => {
      const alias = ALIAS_MUN[nome];
      if (alias && (!ufForte || ufForte === alias[0]) && (ufContexto ?? alias[0]) === alias[0]) {
        const t = idx.porUfNome.get(alias[0] + "|" + alias[1]);
        if (t) return t;
      }
      const cands = idx.porNome.get(nome);
      if (!cands || !cands.length) return undefined;
      if (ufForte) {
        const f = cands.filter((c) => c[2] === ufForte);
        return f.length === 1 ? f[0] : undefined;
      }
      const ufDoContexto = !!ufContexto && cands.some((c) => c[2] === ufContexto);
      // homônimo de país ("na Colômbia", "na França", "em Cabo Verde"): é o país, salvo "cidade de"/UF no texto
      const pais = PAIS_POR_NOME.get(nome);
      if (pais && !forte && !ufDoContexto && !grafiaBrasileira(trechoOrig, pais, idx)) return undefined;
      const cap = cands.find((c) => CAPITAIS[c[2]] === nome);
      if (cap) return cap;
      // homônimo de cidade do exterior ("Buenos Aires", "Santiago", "Barcelona"): ambíguo sem UF no texto
      if (idx.ext.has(nome) && !forte && !ufDoContexto) return undefined;
      if (cands.length === 1) return cands[0];
      if (ufContexto) {
        const f = cands.filter((c) => c[2] === ufContexto);
        if (f.length === 1) return f[0];
      }
      return undefined;
    };

    // "Campinas (SP)" / "Bom Jesus (PI)"
    const reParen = new RegExp(`\\((${SIGLAS.join("|")})\\)`, "g");
    let mp: RegExpExecArray | null;
    while ((mp = reParen.exec(base))) {
      const uf = mp[1].toLowerCase();
      const antes = cityLow.slice(Math.max(0, mp.index - 60), mp.index).trimEnd();
      const ws = antes.split(" ").filter(Boolean);
      for (let k = Math.min(ws.length, idx.maxPalavras); k >= 1; k--) {
        const nome = ws.slice(ws.length - k).join(" ");
        const t = idx.porUfNome.get(uf + "|" + nome);
        if (t) {
          const ini = Math.max(0, cityLow.lastIndexOf(nome, mp.index));
          return det(escopoMun(t), ini, ini + nome.length);
        }
      }
    }

    // "em Campinas", "na cidade de X", "no município de X"
    const reGat = /\b(?:na cidade de|na cidade do|cidade de|cidade do|no municipio de|municipio de|prefeitura de|em|no|na)\s+/g;
    let mg2: RegExpExecArray | null;
    while ((mg2 = reGat.exec(cityLow))) {
      const forte = /cidade|municipio|prefeitura/.test(mg2[0]);
      const pos = mg2.index + mg2[0].length;
      if (!/[A-Z]/.test(base[pos] ?? "")) continue;
      const { palavras, fins } = lerPalavras(cityLow, pos, idx.maxPalavras);
      for (let k = palavras.length; k >= 1; k--) {
        const nome = palavras.slice(0, k).join(" ");
        if (!idx.porNome.has(nome) && !ALIAS_MUN[nome]) continue;
        const fim = fins[k - 1];
        if (!forte && ocupadoUf(pos, fim)) break; // é estado ("em São Paulo")
        if (!forte && MUN_PALAVRA_COMUM.has(nome)) break;
        // pista de UF logo depois: "Campinas, em SP" / "Campinas-SP"
        const t = escolher(nome, pistaUfDepois(base, fim), forte, orig.slice(pos, fim));
        if (t) return det(escopoMun(t), pos, fim);
        break;
      }
    }

    // "Santana de Parnaíba SP", "Campinas-SP", "Campinas/SP", "Campinas, SP": sigla solta logo depois do nome
    if (!caixaAlta(base)) {
      const reSolta = new RegExp(`(^|[^A-Za-z0-9(])(${SIGLAS.join("|")})(?![A-Za-z0-9)])`, "g");
      let ms: RegExpExecArray | null;
      while ((ms = reSolta.exec(base))) {
        const uf = ms[2].toLowerCase();
        const ini = ms.index + ms[1].length;
        const bruto = cityLow.slice(Math.max(0, ini - 60), ini);
        const antes = bruto.replace(/[\s,/]+$/, "");
        const fimNome = ini - (bruto.length - antes.length);
        if (fimNome === ini) continue; // colado ("XSP")
        const ws = antes.split(" ");
        for (let k = Math.min(ws.length, idx.maxPalavras); k >= 1; k--) {
          const nome = ws.slice(ws.length - k).join(" ");
          const t = idx.porUfNome.get(uf + "|" + nome);
          if (t && /[A-Z]/.test(base[fimNome - nome.length] ?? "")) return det(escopoMun(t), fimNome - nome.length, fimNome);
        }
      }
    }
  }

  // --- UF ---
  if (ufs.length) return det(escopoUf(ufs[0].uf), ufs[0].start, ufs[0].end);
  return null;
}

function detectarEscopo(base: string, low: string, orig: string, municipios?: MunicipioTuple[]): Deteccao {
  const idx = municipios && municipios.length ? indiceMunicipios(municipios) : null;
  const pergunta = detectorPergunta(low, oracoes(low));
  const ext = acharExterior(base, low, orig, idx, pergunta);
  const br = detectarEscopoBr(base, low, orig, idx);
  // lugar só citado numa pergunta perde para o lugar da resposta ("Lula vence em SP? Não: Flávio lidera em Tóquio")
  if (ext && br) {
    const pe = pergunta(ext.det.ini);
    const pb = pergunta(br.ini);
    if (pe !== pb) return pe ? br : ext.det;
  }
  // o lugar citado primeiro vence ("Flávio vence no Japão e em SP" → Japão; "Em SP, Flávio…; no Japão, Lula" → SP)
  if (ext && (!br || ext.primeira <= br.ini)) return ext.det;
  return br ?? { escopo: escopoBr(), ini: -1, fim: -1 };
}

// ---------------------------------------------------------------------------
// Lugar de cada número ("Flávio tem 70% no Japão e Lula 60% na China" → os 60% não são do Japão)
// ---------------------------------------------------------------------------

interface Lugar {
  ini: number;
  fim: number;
  /** "ext" = exterior/região genérica (uf zz); "br" = "no Brasil" (resultado nacional) */
  tipo: "ext" | "pais" | "uf" | "mun" | "br";
  uf?: string;
  mun?: string;
  pais?: string;
  /** município/cidade do exterior */
  t?: MunicipioTuple;
}

/** Todas as menções a lugares (exterior, UFs e municípios brasileiros sem ambiguidade), com posição. */
function mencoesLugares(base: string, low: string, orig: string, idx: IndiceMun | null): Lugar[] {
  const out: Lugar[] = [];
  const ext = acharExterior(base, low, orig, idx);
  for (const m of ext?.mencoes ?? []) {
    if (m.tipo === "pais") out.push({ ini: m.ini, fim: m.fim, tipo: "pais", pais: m.pais });
    else if (m.tipo === "cidade" && m.cidade)
      out.push({ ini: m.ini, fim: m.fim, tipo: "mun", uf: "zz", mun: m.cidade[0], pais: paisDaCidade(m.cidade[0])?.pais, t: m.cidade });
    else out.push({ ini: m.ini, fim: m.fim, tipo: "ext", uf: "zz" });
  }
  // "No Brasil, Lula lidera com 47%" (não "brasileiros fora do Brasil")
  const reBr = /\b(?:no|pelo|em todo o|para o)\s+(brasil)\b/g;
  let mb: RegExpExecArray | null;
  while ((mb = reBr.exec(low))) {
    if (/\bfora\s+$/.test(low.slice(Math.max(0, mb.index - 6), mb.index))) continue;
    const ini = mb.index + mb[0].length - mb[1].length;
    out.push({ ini, fim: ini + mb[1].length, tipo: "br" });
  }
  const ufs = acharUfs(base, low, orig);
  if (idx) {
    const cityLow = low.replace(/[-'’]/g, " ");
    const re = /\b(?:em|no|na|cidade de|municipio de)\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cityLow))) {
      const pos = m.index + m[0].length;
      if (!/[A-Z]/.test(base[pos] ?? "")) continue;
      const { palavras, fins } = lerPalavras(cityLow, pos, idx.maxPalavras);
      for (let k = palavras.length; k >= 1; k--) {
        const nome = palavras.slice(0, k).join(" ");
        const cands = idx.porNome.get(nome);
        if (!cands) continue;
        const fim = fins[k - 1];
        const pista = pistaUfDepois(base, fim);
        // sem UF, homônimos de palavra comum, de país ou de cidade do exterior ("Assunção", "Santiago") ficam ambíguos
        const ambiguo = MUN_PALAVRA_COMUM.has(nome) || PAIS_POR_NOME.has(nome) || idx.ext.has(nome);
        const f = pista ? cands.filter((c) => c[2] === pista) : ambiguo ? [] : cands;
        if (f.length === 1) out.push({ ini: pos, fim, tipo: "mun", uf: f[0][2], mun: f[0][0], t: f[0] });
        break;
      }
    }
  }
  // a UF que só qualifica o município ("Tailândia (PA)", "Campinas-SP") não é um lugar à parte
  for (const u of ufs) {
    const doMun = out.some((x) => x.tipo === "mun" && x.uf === u.uf && x.fim <= u.start && u.start - x.fim <= 6);
    if (!doMun) out.push({ ini: u.start, fim: u.end, tipo: "uf", uf: u.uf });
  }
  return out;
}

/** Escopo correspondente a uma menção (na mesma posição, prefere UF > país > cidade > exterior). */
function escopoDeLugares(gs: Lugar[]): Lugar & { escopo: EscopoBoletim } {
  const ordem = { uf: 0, pais: 1, mun: 2, ext: 3, br: 4 } as const;
  const g = [...gs].sort((a, b) => ordem[a.tipo] - ordem[b.tipo])[0];
  const escopo =
    g.tipo === "uf" && g.uf
      ? escopoUf(g.uf)
      : g.tipo === "pais" && g.pais
        ? escopoPais(g.pais)
        : g.tipo === "mun" && g.t
          ? escopoMun(g.t)
          : g.tipo === "br"
            ? escopoBr()
            : escopoExterior();
  return { ...g, escopo };
}

/** O lugar `g` é o próprio escopo ou o contém (Japão ⊇ Tóquio; SP ⊇ Campinas; exterior ⊇ Japão). */
function abrange(g: Lugar, s: EscopoBoletim): boolean {
  switch (g.tipo) {
    case "ext":
      return s.tipo !== "br" && s.uf === "zz";
    case "pais":
      return (
        (s.tipo === "pais" && s.pais === g.pais) ||
        (s.tipo === "mun" && s.uf === "zz" && !!s.mun && paisDaCidade(s.mun)?.pais === g.pais)
      );
    case "uf":
      return (s.tipo === "uf" || s.tipo === "mun") && s.uf === g.uf;
    case "mun":
      return s.tipo === "mun" && s.uf === g.uf && s.mun === g.mun;
    case "br":
      return s.tipo === "br";
  }
}

/**
 * Lugares a que o número se refere: o citado logo depois ("70% no Japão") ou, senão, o mais próximo antes
 * na mesma oração ("Em Tóquio, Flávio tem 70%"). Vazio = sem lugar próprio (vale o escopo do boletim).
 */
function lugaresDoNumero(p: Pct, lugares: Lugar[], low: string, orac: Int32Array, pcts: Pct[], ents: Ent[]): Lugar[] {
  const oracao = orac[p.start];
  const depois = lugares
    .filter((g) => g.ini >= p.end && g.ini - p.end <= 30 && orac[g.ini] === oracao)
    .sort((a, b) => a.ini - b.ini);
  if (depois.length) {
    const g0 = depois[0];
    const entre = low.slice(p.end, g0.ini);
    if (
      !/\b(?:e|mas|enquanto|contra|ja)\b/.test(entre) &&
      !pcts.some((q) => q !== p && q.start >= p.end && q.start < g0.ini) &&
      !ents.some((x) => x.start >= p.end && x.start < g0.ini)
    )
      return depois.filter((g) => g.ini === g0.ini);
  }
  const antes = lugares.filter((g) => g.fim <= p.start && orac[g.ini] === oracao);
  if (!antes.length) return [];
  const ini = Math.max(...antes.map((g) => g.ini));
  return antes.filter((g) => g.ini === ini);
}

// ---------------------------------------------------------------------------
// Vencedor ("Lula vence na China" → pt)
// ---------------------------------------------------------------------------

// verbo de vitória logo depois do nome ("Lula vence", "Flávio Bolsonaro (PL) fica em 1º", "Flávio leva a melhor")
const RE_VERBO_VITORIA = new RegExp(
  "^(?:\\s+bolsonaro)?(?:\\s*\\((?:pt|pl)\\))?" +
    // aposto curto: "Flávio Bolsonaro, por sua vez, venceu no Japão"
    "(?:\\s*,\\s*(?:por sua vez|por outro lado|por seu lado|no entanto|porem|contudo|alias)\\s*,)?" +
    "\\s*,?\\s*(?:(?:tambem|ja|novamente|agora|ainda|de novo)\\s+)?(?:" +
    [
      "vence|venceu|ganha|ganhou|lidera|liderou|leva a melhor|levou a melhor|leva|levou|conquista|conquistou",
      "domina|dominou|derrota|derrotou|supera|superou|bate|bateu|arrasa|arrasou",
      "(?:fica|ficou|termina|terminou|aparece|apareceu|chega|chegou|esta|segue|seguia|sai|saiu|larga|largou|dispara|disparou)\\s+(?:em\\s+(?:1o|primeiro)(?:\\s+lugar)?|na\\s+frente|a\\s+frente|na\\s+lideranca)",
      "(?:abre|abriu|amplia|ampliou|tem|teve|mantem|manteve)\\s+vantagem",
      "segue\\s+liderando",
      "(?:e|foi)\\s+o\\s+(?:candidato\\s+)?mais\\s+votado",
      "(?:tem|teve|recebe|recebeu|soma|somou)\\s+mais\\s+votos",
      "(?:tem|teve|recebe|recebeu|soma|somou)\\s+mais\\s+(?:que|do\\s+que)\\s+o\\s+(?:dobro|triplo)",
      "se\\s+impoe|se\\s+impos|prevalece|prevaleceu|triunfa|triunfou|(?:sai|saiu)\\s+vitorioso|(?:e|foi)\\s+o\\s+vencedor",
      "(?:e|foi)\\s+(?:re)?eleito",
    ].join("|") +
    ")\\b",
);
// sujeito (lugar) antes: "Austrália e Malásia dão vitória a Lula", "Japão escolhe Flávio", "vitória de Lula na China"
const RE_PASSIVA_ANTES =
  /\b(?:(?:da|dao|deu|deram|garante|garantem|garantiu|garantiram)\s+(?:a\s+)?(?:vitoria|vantagem|lideranca|maioria)\s+(?:a|ao|para|para o|pra)|(?:escolhe|escolhem|escolheu|escolheram|elege|elegem|elegeu|elegeram|prefere|preferem|preferiu|preferiram)(?:\s+o)?|vitoria\s+(?:de|do|da)|perde\s+para|perdeu\s+para)\s+$/;
// complemento que é contagem, não o lugar: "Lula vence em seis países", "em 5 de 8 países", "na maioria dos países",
// "Flávio leva dois"
const RE_COMPL_CONTAGEM =
  /^\s*,?\s*(?:(?:\d+|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b(?!\s*(?:%|por\s?cento|mil\b|milh))|(?:em|no|na|nos|nas)\s+(?:(?:mais|outros|outras|varios|varias|alguns|algumas|maioria|parte|metade|\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|de|d[oa]s?)\s+)*(?:paises|cidades|estados(?!\s+unidos)|capitais|municipios|consulados|embaixadas|secoes|locais|postos|continentes|lugares|zonas|regioes|\d+\b|um\b|uma\b|dois\b|duas\b|tres\b|quatro\b|cinco\b|seis\b|sete\b|oito\b|nove\b|dez\b))/;
// "… no exterior em cinco países", "… no exterior na maioria dos países"
const RE_CONTAGEM_DEPOIS =
  /^\s*,?\s*(?:em|no|na|nos|nas)\s+(?:(?:mais|outros|outras|varios|varias|alguns|algumas|maioria|parte|metade|\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|de|d[oa]s?)\s+)+(?:paises|cidades|consulados|embaixadas|secoes|locais|postos|continentes|lugares|zonas|regioes)\b/;
// resultado nacional explícito (escopo Brasil)
const RE_VITORIA_NACIONAL =
  /\b(?:(?:re)?eleit[oa]|vence (?:a eleicao|as eleicoes|(?:no|o) (?:1o|2o|primeiro|segundo) turno|a disputa presidencial))\b/;

interface Alegacao {
  bloco: BlocoId;
  /** início do sujeito/verbo (para lugar citado ANTES) */
  ini: number;
  /** início do complemento (para lugar citado DEPOIS) */
  compIni: number;
  /** "Lula vence em seis países" — não liga a um lugar */
  contagem: boolean;
  /** forma passiva ("dão vitória a Lula"): o lugar vem antes e pode estar mais longe */
  passiva: boolean;
  /** o complemento já é um lugar ("Flávio vence no Japão") — não se liga a um lugar citado antes */
  lugarDepois: boolean;
}

function acharAlegacoes(base: string, low: string, ents: Ent[]): Alegacao[] {
  const out: Alegacao[] = [];
  const blocos = ents.filter((e) => e.tipo !== "outro");
  // o complemento começa por um lugar ("… vence na China"): a alegação é desse lugar, não de um citado antes
  const lugarEm = (i: number) => {
    const m = /^\s*,?\s*(?:em|no|na|nos|nas|pelo|pela)\s+/.exec(low.slice(i, i + 12));
    return !!m && /[A-Z]/.test(base[i + m[0].length] ?? "");
  };
  const nova = (bloco: BlocoId, ini: number, compIni: number, passiva: boolean): Alegacao => ({
    bloco,
    ini,
    compIni,
    contagem: RE_COMPL_CONTAGEM.test(low.slice(compIni, compIni + 60)),
    passiva,
    lugarDepois: lugarEm(compIni),
  });
  for (const e of blocos) {
    const bloco = e.tipo as BlocoId;
    const depois = low.slice(e.end, e.end + 80);
    const mv = RE_VERBO_VITORIA.exec(depois);
    if (mv) {
      let compIni = e.end + mv[0].length;
      // objeto: "Lula vence Flávio Bolsonaro na Austrália", "Flávio abre vantagem sobre Lula e vence no Japão"
      const obj = ents.find((x) => x.start >= compIni && /^\s*(?:(?:sobre|contra|de|a|ao)\s+(?:o\s+)?)?$/.test(low.slice(compIni, x.start)));
      if (obj) {
        compIni = obj.end;
        const mvc = /^\s+e\s+(?:vence|venceu|ganha|ganhou|lidera|leva|levou|fica em (?:1o|primeiro)|fica na frente)\b/.exec(low.slice(compIni, compIni + 40));
        if (mvc) compIni += mvc[0].length;
      }
      out.push(nova(bloco, e.start, compIni, false));
      continue;
    }
    const antes = low.slice(Math.max(0, e.start - 50), e.start);
    const mp = RE_PASSIVA_ANTES.exec(antes);
    if (mp) out.push(nova(bloco, e.start - (antes.length - mp.index), e.end, true));
  }
  // elipse: "Lula vence em 5 países e Flávio Bolsonaro nas Filipinas" / "…; Flávio, no Japão"
  for (const e of blocos) {
    if (out.some((a) => a.ini <= e.start && a.compIni >= e.end)) continue;
    if (!out.some((a) => a.ini < e.start)) continue;
    const md = /^(?:\s+bolsonaro)?\s*,?\s*(?=(?:em|no|na|nos|nas)\s)/.exec(low.slice(e.end, e.end + 20));
    if (!md) continue;
    out.push({ ...nova(e.tipo as BlocoId, e.start, e.end + md[0].length, false), lugarDepois: true });
  }
  return out;
}

// fala/expectativa antes da alegação, na mesma oração: "Orlando Silva diz que Lula vence no 1º turno",
// "aliados apostam em vitória de Lula no Japão", "chance de vitória de Flávio"
const RE_FALA_ANTES =
  /\b(?:(?:diz|dizem|disse|disseram|afirma|afirmam|afirmou|acredita|acreditam|acreditou|acha|acham|aposta|apostam|apostou|preve|preveem|previu|espera|esperam|esperava|confia|confiam|avalia|avaliam|projeta|projetam|estima|estimam|promete|prometem|prometeu|garante|garantem|garantiu|crava|cravam|cravou|jura|juram|torce|torcem|quer|querem|sonha|sonham)\s+(?:(?:[a-z]+\s+){0,2}?que|em|por|pela|pelo)|chances?\s+de|possibilidade\s+de|risco\s+de|caso\s+de)\s+(?:[a-z]+\s+){0,3}?$/;

/** Quem o boletim diz que venceu/lidera no escopo detectado. */
function acharVencedor(
  base: string,
  low: string,
  ents: Ent[],
  det: Deteccao,
  orac: Int32Array,
  /** orações com a resposta "? Não, …" juntada à pergunta (só para ligar lugar e alegação) */
  oracLiga: Int32Array = orac,
): BlocoId | undefined {
  const alegs = acharAlegacoes(base, low, ents).filter((a) => {
    // pergunta ("Lula vence no DF?") não é afirmação
    let k = a.compIni;
    while (k < low.length && orac[k] === orac[a.ini]) k++;
    if (low[k - 1] === "?") return false;
    // fala/expectativa ("X diz que Lula vence…", "aposta em vitória de Lula") não é resultado
    let i0 = a.ini;
    while (i0 > 0 && orac[i0 - 1] === orac[a.ini]) i0--;
    return !RE_FALA_ANTES.test(low.slice(Math.max(i0, a.ini - 80), a.ini));
  });
  if (!alegs.length) return undefined;
  const blocosEntre = (a: number, b: number) => ents.some((x) => x.tipo !== "outro" && x.start >= a && x.start < b);
  let ligadas: Alegacao[];
  if (det.ini < 0 || det.escopo.tipo === "br") {
    ligadas = alegs.filter((a) => {
      let k = a.ini;
      while (k > 0 && orac[k - 1] === orac[a.ini]) k--;
      let f = a.ini;
      while (f < low.length && orac[f] === orac[a.ini]) f++;
      return RE_VITORIA_NACIONAL.test(low.slice(k, f)) && !/\b(?:se|caso)\b/.test(low.slice(k, a.ini));
    });
  } else {
    const M = det;
    if (M.semVencedor) return undefined;
    // "Lula lidera votação no exterior em cinco países" — contagem de países, não o total do exterior
    const contagemDepois =
      det.escopo.tipo === "uf" && det.escopo.uf === "zz" && RE_CONTAGEM_DEPOIS.test(low.slice(M.fim, M.fim + 50));
    ligadas = alegs.filter((a) => {
      if (a.contagem) return false;
      if (contagemDepois && M.ini >= a.compIni) return false;
      if (oracLiga[M.ini] !== oracLiga[a.ini] && oracLiga[M.ini] !== oracLiga[Math.min(a.compIni, low.length - 1)]) return false;
      // lugar depois do verbo: "Lula vence na China", "Flávio foi o mais votado pelos brasileiros no Japão"
      // (não vale se outro lugar vem antes: "Lula larga na frente no exterior: Nova Zelândia, …")
      if (
        M.ini >= a.compIni &&
        M.ini - a.compIni <= 45 &&
        !blocosEntre(a.compIni, M.ini) &&
        !/\bexterior\b|:/.test(low.slice(a.compIni, M.ini))
      )
        return true;
      // lugar antes: "Na China, Lula vence", "Japão: Flávio lidera", "Austrália e Malásia dão vitória a Lula"
      if (!a.lugarDepois && M.fim <= a.ini && a.ini - M.fim <= (a.passiva ? 90 : 30) && !blocosEntre(M.fim, a.ini)) return true;
      return false;
    });
  }
  const bl = new Set(ligadas.map((a) => a.bloco));
  return bl.size === 1 ? [...bl][0] : undefined;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Extrai de um texto de boletim (manchete + resumo) o % apurado, o % do Lula,
 * o % do Flávio, o escopo (Brasil / UF / município / país ou cidade do exterior)
 * e quem o boletim diz que venceu no escopo ("Lula vence na China").
 * `municipios` (public/data/municipios.json) habilita a detecção de cidades (inclusive do exterior);
 * os países vêm de src/lib/exterior/paises.ts.
 */
export function parseBoletim(texto: string, municipios?: MunicipioTuple[]): NumerosBoletim {
  const out: NumerosBoletim = {};
  if (!texto || !texto.trim()) {
    out.escopo = escopoBr();
    return out;
  }
  const { base, low, orig } = preparar(texto);
  const tipo = classificarBoletim(texto);
  const aceitaBolsonaro =
    (tipo === "apuracao" || tipo === "boca-de-urna") &&
    !/\bjair\b/.test(low) &&
    !/\b(?:inelegivel|prisao|preso|condenad|tornozeleira|domiciliar)\b/.test(low);
  const ents = acharEntidades(base, low, aceitaBolsonaro);
  const pcts = acharPcts(low);
  const orac = oracoes(low);
  // evolução "passa de 39% para 42%": o valor de origem é ignorado e não bloqueia a atribuição do destino
  const origemEvolucao = new Set<Pct>();
  for (let i = 0; i + 1 < pcts.length; i++) {
    const p = pcts[i];
    const q = pcts[i + 1];
    if (/^\s*(?:para|a|pra)\s*$/.test(low.slice(p.end, q.start)) && /\b(?:de|desde)\s*$/.test(low.slice(Math.max(0, p.start - 6), p.start)))
      origemEvolucao.add(p);
  }
  // faixa "entre 45% e 49%" (projeções): nenhum dos dois valores é atribuído
  const faixa = new Set<Pct>();
  for (let i = 0; i + 1 < pcts.length; i++) {
    const p = pcts[i];
    const q = pcts[i + 1];
    if (/^\s*(?:e|a)\s*$/.test(low.slice(p.end, q.start)) && /\bentre\s*$/.test(low.slice(Math.max(0, p.start - 8), p.start))) {
      faixa.add(p);
      faixa.add(q);
    }
  }
  // entidades que já receberam uma porcentagem (layout "47% Lula x 43% Flávio")
  const usados = new Set<Ent>();
  // posição do 1º número atribuído (candidato > apurado): o escopo é lido até o fim dessa oração
  let ancoraCand: number | undefined;
  let ancoraApur: number | undefined;
  /** porcentagem atribuída a cada candidato (para conferir o lugar do número) */
  const pctDe: Partial<Record<BlocoId, Pct>> = {};

  for (let i = 0; i < pcts.length; i++) {
    const p = pcts[i];
    if (p.valor < 0 || p.valor > 100) continue;
    if (origemEvolucao.has(p) || faixa.has(p)) continue;
    const depois = low.slice(p.end, p.end + 60);
    const antes = low.slice(Math.max(0, p.start - 45), p.start);

    // --- % apurado ---
    const apurDepois = RE_APUR_DEPOIS.test(depois) || RE_APUR_DEPOIS_2.test(depois);
    // "Apuração: 47% para Lula, …" — o rótulo antes não vale quando o % é atribuído a um candidato logo depois
    let apurado = apurDepois || (RE_APUR_ANTES.test(antes) && !RE_PARA_CANDIDATO.test(depois));
    if (apurado && RE_VOTOS_APURADOS.test(depois)) {
      // "Lula tem 47% dos votos apurados" (candidato) × "com 45% dos votos apurados" (apuração)
      const entAntes = [...ents].reverse().find((e) => e.end <= p.start);
      if (
        entAntes &&
        entAntes.tipo !== "outro" &&
        p.start - entAntes.end <= 22 &&
        !pcts.some((q) => q.start >= entAntes.end && q.end <= p.start)
      )
        apurado = false;
    }
    const mu = RE_URNAS_DEPOIS.exec(depois);
    // "Faltando 10% das urnas…" / "faltam apurar 10%" → 90% apurado
    const mf = RE_FALTA_ANTES.exec(antes);
    if (mf && (mf[1] || mu || apurDepois)) {
      if (out.pctApurado === undefined) {
        out.pctApurado = Math.round((100 - p.valor) * 100) / 100;
        ancoraApur = p.start;
      }
      continue;
    }
    if (!apurado && mu) {
      if (RE_URNAS_NUA.test(mu[1])) apurado = true;
      else continue; // "99% das urnas operam sem falhas" — nem apurado nem candidato
    }
    if (apurado) {
      if (out.pctApurado === undefined) {
        out.pctApurado = p.valor;
        ancoraApur = p.start;
      }
      continue;
    }

    // --- descartes ---
    if (RE_IGNORA_DEPOIS.test(depois) || RE_IGNORA_ANTES.test(antes)) continue;
    // "Lula em 80% dos posts", "70% dos municípios": % de outra coisa (lugar com inicial maiúscula é aceito: "60% da Bahia")
    // ("47% do petista", "43% do senador Flávio" são do candidato citado logo depois)
    const md = /^\s*d[oa]s?\s+([a-z]+)/.exec(depois);
    if (md && !PCT_DE_VOTOS.has(md[1]) && !/[A-Z]/.test(base[p.end + md[0].length - md[1].length] ?? "")) {
      const seguinte = ents.find((e) => e.start >= p.end);
      if (!seguinte || !RE_FRENTE_EXPLICITA.test(low.slice(p.end, seguinte.start))) continue;
    }
    if (RE_HIST_DEPOIS.test(depois)) continue;
    const oracao = orac[p.start];
    let inicioOracao = p.start;
    while (inicioOracao > 0 && orac[inicioOracao - 1] === oracao) inicioOracao--;
    const trechoAntes = low.slice(inicioOracao, p.start);
    // "Em 2022, Bolsonaro teve 43,2%" é histórico; "Lula supera votação de 2022 e chega a 49%" não
    const mAno = /\b20(?:18|22)\b/.exec(trechoAntes);
    if (mAno && !/\b2026\b/.test(trechoAntes) && (mAno.index <= 15 || RE_VERBO_PASSADO.test(trechoAntes.slice(mAno.index)))) continue;

    // --- atribuição ---
    const mesmaOracao = (e: Ent) => orac[e.start] === oracao;
    const prox = ents.find((e) => e.start >= p.end && mesmaOracao(e));
    const ant = [...ents].reverse().find((e) => e.end <= p.start && mesmaOracao(e));
    const pctEntre = (a: number, b: number) =>
      pcts.some((q) => q !== p && !origemEvolucao.has(q) && q.start >= a && q.end <= b);

    const proxColado = !!prox && !pctEntre(p.end, prox.start) && RE_FRENTE_NUA.test(low.slice(p.end, prox.start));
    let alvo: Ent | undefined;
    if (prox && !pctEntre(p.end, prox.start) && RE_FRENTE_EXPLICITA.test(low.slice(p.end, prox.start))) {
      alvo = prox;
    } else if (ant && usados.has(ant) && proxColado) {
      // "47,2% Lula x 43,1% Flávio": Lula já tem o seu número → o 43,1% é do nome que vem logo depois
      alvo = prox;
    } else if (ant) {
      const entre = low.slice(ant.end, p.start);
      if (
        entre.length <= 50 &&
        !pctEntre(ant.end, p.start) &&
        !RE_ENTRE_BLOQUEIA.test(entre) &&
        !RE_ANTES_ENT_BLOQUEIA.test(low.slice(Math.max(0, ant.start - 30), ant.start))
      )
        alvo = ant;
    }
    if (!alvo && proxColado) {
      alvo = prox;
    }
    // "Com 73,4% dos votos válidos, Flávio Bolsonaro foi o mais votado"
    if (
      !alvo &&
      prox &&
      /\bcom\s+(?:mais de\s+|quase\s+|cerca de\s+)?$/.test(antes) &&
      !pctEntre(p.end, prox.start) &&
      /^\s*(?:d[oa]s\s+(?:votos(?:\s+validos)?|validos)\s*)?,\s*$/.test(low.slice(p.end, prox.start))
    )
      alvo = prox;
    if (!alvo) continue;
    usados.add(alvo);
    if (alvo.tipo === "outro") continue;
    if ((alvo.tipo === "pt" && out.pt === undefined) || (alvo.tipo === "bolso" && out.bolso === undefined)) ancoraCand ??= p.start;
    if (alvo.tipo === "pt" && out.pt === undefined) {
      out.pt = p.valor;
      pctDe.pt = p;
    }
    if (alvo.tipo === "bolso" && out.bolso === undefined) {
      out.bolso = p.valor;
      pctDe.bolso = p;
    }
  }

  // escopo: lugares citados até o fim da oração do 1º número extraído
  // ("Lula tem 47% no Brasil; em Campinas, 40%" → Brasil; "Em PE, Lula tem 70%; na capital, 60%" → PE)
  let fim = low.length;
  const ancora = ancoraCand ?? ancoraApur;
  if (ancora !== undefined) {
    const c = orac[ancora];
    fim = ancora;
    while (fim < low.length && orac[fim] === c) fim++;
  }
  let det = detectarEscopo(base.slice(0, fim), low.slice(0, fim), orig.slice(0, fim), municipios);
  const oracLiga = oracoes(low, true);
  // quem o boletim diz que venceu/lidera no escopo
  // (não vale para pesquisa de intenção de voto)
  let vencedor = tipo !== "pesquisa" ? acharVencedor(base, low, ents, det, orac, oracLiga) : undefined;
  // número de outro lugar não vale para o escopo: "Flávio tem 70% no Japão e Lula 60% na China" → só os 70%;
  // "Em Tóquio, Flávio tem 70%; em Lisboa, Lula tem 60%" → só os 70%
  if (pctDe.pt || pctDe.bolso) {
    const idx = municipios && municipios.length ? indiceMunicipios(municipios) : null;
    const lugares = mencoesLugares(base, low, orig, idx);
    // o 1º número tem lugar próprio fora do escopo e o escopo não tem vencedor citado
    // ("Flávio lidera em SP, RJ e DF; … no Piauí: Lula, 66%") → o escopo passa a ser o lugar do número
    // (com vencedor — "Lula vence na China e Flávio tem 70% no Japão" — fica o lugar da vitória, sem o número)
    const ancoraPct = [pctDe.pt, pctDe.bolso].filter((x): x is Pct => !!x).sort((a, b) => a.start - b.start)[0];
    const gA = lugaresDoNumero(ancoraPct, lugares, low, orac, pcts, ents);
    if (!vencedor && gA.length && !gA.some((x) => abrange(x, det.escopo))) {
      const g = escopoDeLugares(gA);
      det = { escopo: g.escopo, ini: g.ini, fim: g.fim };
      if (tipo !== "pesquisa") vencedor = acharVencedor(base, low, ents, det, orac, oracLiga);
    }
    for (const b of ["pt", "bolso"] as const) {
      const p = pctDe[b];
      if (!p) continue;
      const g = lugaresDoNumero(p, lugares, low, orac, pcts, ents);
      if (g.length && !g.some((x) => abrange(x, det.escopo))) delete out[b];
    }
  }
  out.escopo = det.escopo;
  if (vencedor) out.vencedor = vencedor;
  return out;
}
