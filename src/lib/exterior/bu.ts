// Decodificador do Boletim de Urna (BU) binário publicado pelo TSE (arquivo "*-bu.dat").
// TS puro (sem APIs do Node): roda no servidor e, se preciso, no navegador.
//
// Formato: ASN.1 DER (especificação TSE "EntidadeEnvelopeGenerico" → "EntidadeBoletimUrna").
//   EntidadeEnvelopeGenerico SEQ { cabecalho, fase, identificação [C0], tipoEnvelope ENUM,
//                                  conteudo OCTET STRING (= DER da EntidadeBoletimUrna), ... }
//   EntidadeBoletimUrna SEQ {
//     cabecalho SEQ, fase ENUM, urna SEQ,
//     identificacaoSecao SEQ { SEQ { municipio INT, zona INT }, local INT, secao INT },
//     dataHoraEmissao VisibleString "AAAAMMDDTHHMMSS" (hora LOCAL da seção),
//     dadosSecaoSA [C0] { abertura, encerramento },
//     INT (qtd. eleitores), ...
//     resultadosVotacaoPorEleicao SEQ OF SEQ {
//       idEleicao INT, qtdEleitoresAptos INT, INT..., resultadosVotacao SEQ OF SEQ {
//         tipoCargo ENUM, qtdComparecimento INT, totaisVotosCargo SEQ OF SEQ {
//           codigoCargo [1] (1 = Presidente), ordemImpressao INT, votosVotaveis SEQ OF SEQ {
//             tipoVoto [1], quantidadeVotos [2], identificacaoVotavel [3] SEQ { partido INT, codigo INT } OPTIONAL,
//             ordemGeracaoHash INT, hash OCTET STRING } } } }, ... }
//
// A navegação é estrutural (procura nós pelo formato, não por posição fixa) e validada pelo
// checksum: soma de todos os votos do cargo === qtdComparecimento do cargo.

// ---------------------------------------------------------------------------
// Parser TLV (DER/BER)
// ---------------------------------------------------------------------------

/** Classe da tag ASN.1. */
export const ClasseTag = { Universal: 0, Aplicacao: 1, Contexto: 2, Privada: 3 } as const;
export type ClasseTag = (typeof ClasseTag)[keyof typeof ClasseTag];

/** Tags universais usadas aqui. */
export const TAG = {
  INTEGER: 2,
  OCTET_STRING: 4,
  ENUMERATED: 10,
  UTF8_STRING: 12,
  SEQUENCE: 16,
  PRINTABLE_STRING: 19,
  IA5_STRING: 22,
  VISIBLE_STRING: 26,
  GENERAL_STRING: 27,
} as const;

export interface Tlv {
  classe: ClasseTag;
  construido: boolean;
  /** número da tag (já decodificado, inclusive multi-byte) */
  tag: number;
  /** offset do primeiro byte do cabeçalho (identificador) */
  inicio: number;
  /** offset do primeiro byte do valor */
  valor: number;
  /** offset logo após o valor (exclusivo; para comprimento indefinido, ANTES do EOC 00 00) */
  fim: number;
  /** offset logo após o TLV inteiro (inclui o EOC no comprimento indefinido) */
  proximo: number;
}

export class BerError extends Error {
  constructor(msg: string, public readonly offset: number) {
    super(`${msg} (offset ${offset})`);
    this.name = "BerError";
  }
}

const MAX_PROFUNDIDADE = 64;

/** Lê o TLV que começa em `off` (sem passar de `limite`). */
export function lerTlv(b: Uint8Array, off: number, limite: number = b.length, prof = 0): Tlv {
  if (prof > MAX_PROFUNDIDADE) throw new BerError("Aninhamento excessivo", off);
  const inicio = off;
  if (off >= limite) throw new BerError("Fim inesperado (identificador)", off);
  const id = b[off++];
  const classe = (id >> 6) as ClasseTag;
  const construido = (id & 0x20) !== 0;
  let tag = id & 0x1f;
  if (tag === 0x1f) {
    // tag multi-byte (base 128, bit 8 = continua)
    tag = 0;
    let n = 0;
    while (true) {
      if (off >= limite) throw new BerError("Fim inesperado (tag longa)", off);
      const c = b[off++];
      tag = tag * 128 + (c & 0x7f);
      if (++n > 4) throw new BerError("Tag longa demais", inicio);
      if ((c & 0x80) === 0) break;
    }
  }
  if (off >= limite) throw new BerError("Fim inesperado (comprimento)", off);
  const l0 = b[off++];
  if (l0 === 0x80) {
    // comprimento indefinido (BER): só em construídos; termina no EOC (00 00)
    if (!construido) throw new BerError("Comprimento indefinido em tipo primitivo", inicio);
    const valor = off;
    let p = off;
    while (true) {
      if (p + 1 < limite && b[p] === 0 && b[p + 1] === 0) {
        return { classe, construido, tag, inicio, valor, fim: p, proximo: p + 2 };
      }
      p = lerTlv(b, p, limite, prof + 1).proximo;
    }
  }
  let len: number;
  if (l0 < 0x80) {
    len = l0;
  } else {
    const nBytes = l0 & 0x7f;
    if (nBytes > 4) throw new BerError("Comprimento longo demais", off - 1);
    if (off + nBytes > limite) throw new BerError("Fim inesperado (comprimento longo)", off);
    len = 0;
    for (let i = 0; i < nBytes; i++) len = len * 256 + b[off++];
  }
  const valor = off;
  const fim = valor + len;
  if (fim > limite) throw new BerError(`Comprimento ${len} ultrapassa o limite`, inicio);
  return { classe, construido, tag, inicio, valor, fim, proximo: fim };
}

/** Filhos diretos de um TLV construído. */
export function filhos(b: Uint8Array, t: Tlv): Tlv[] {
  if (!t.construido) return [];
  const out: Tlv[] = [];
  let p = t.valor;
  while (p < t.fim) {
    const c = lerTlv(b, p, t.fim);
    out.push(c);
    p = c.proximo;
  }
  return out;
}

/** Inteiro em complemento de dois, big-endian (até 6 bytes = 48 bits). */
export function lerInteiro(b: Uint8Array, t: Tlv): number {
  const n = t.fim - t.valor;
  if (n === 0) throw new BerError("INTEGER vazio", t.inicio);
  if (n > 6) throw new BerError("INTEGER grande demais", t.inicio);
  let v = 0;
  for (let i = t.valor; i < t.fim; i++) v = v * 256 + b[i];
  if (b[t.valor] & 0x80) v -= 2 ** (8 * n);
  return v;
}

/** String ASCII/Latin-1 (VisibleString, GeneralString, PrintableString...). */
export function lerTexto(b: Uint8Array, t: Tlv): string {
  let s = "";
  for (let i = t.valor; i < t.fim; i++) s += String.fromCharCode(b[i]);
  return s;
}

const eUniversal = (t: Tlv, tag: number, construido?: boolean) =>
  t.classe === ClasseTag.Universal && t.tag === tag && (construido === undefined || t.construido === construido);
const eSeq = (t: Tlv) => eUniversal(t, TAG.SEQUENCE, true);
const eInt = (t: Tlv) => eUniversal(t, TAG.INTEGER, false);
const eCtx = (t: Tlv, tag: number) => t.classe === ClasseTag.Contexto && t.tag === tag;
const TAGS_TEXTO = new Set<number>([
  TAG.UTF8_STRING,
  TAG.PRINTABLE_STRING,
  TAG.IA5_STRING,
  TAG.VISIBLE_STRING,
  TAG.GENERAL_STRING,
]);
const eTexto = (t: Tlv) => t.classe === ClasseTag.Universal && !t.construido && TAGS_TEXTO.has(t.tag);

// ---------------------------------------------------------------------------
// Boletim de urna
// ---------------------------------------------------------------------------

/** Tipos de voto (TipoVoto da especificação do TSE). */
export const TIPO_VOTO = { nominal: 1, branco: 2, nulo: 3, legenda: 4 } as const;

export interface BUDecodificado {
  /** código TSE do município/cidade (5 dígitos) */
  mun: string;
  /** zona (4 dígitos) */
  zona: string;
  /** seção (4 dígitos) */
  secao: string;
  /** local de votação, se presente */
  local: number | null;
  /**
   * data/hora de emissão do BU como ISO SEM fuso ("2026-10-04T17:05:32"): é a hora LOCAL
   * do relógio da urna (no exterior, o fuso da cidade), não a de Brasília.
   */
  emissao: string | null;
  /** valor bruto do BU ("20261004T170532") */
  emissaoRaw: string | null;
  /** eleitores aptos da seção (na eleição pedida) */
  aptos: number;
  /** comparecimento no cargo */
  comparecimento: number;
  /** votos nominais por número de candidato ("13" → 104) */
  votos: Record<string, number>;
  brancos: number;
  nulos: number;
  /** votos de legenda (não ocorrem para Presidente) */
  legenda: number;
  /** votos de outros tipos (nulo por repetição, cargo sem candidato, apurado em separado...) */
  outros: number;
  /** soma de todos os votos do cargo ≠ comparecimento (checksum falhou) */
  inconsistente: boolean;
}

/** Desembrulha o envelope genérico: devolve o nó da EntidadeBoletimUrna. */
function acharEntidadeBU(b: Uint8Array, raiz: Tlv, prof = 0): Tlv | null {
  if (!eSeq(raiz)) return null;
  const cs = filhos(b, raiz);
  if (acharResultadosPorEleicao(b, cs)) return raiz; // já é o BU (sem envelope)
  if (prof >= 2) return null;
  for (const c of cs) {
    if (!eUniversal(c, TAG.OCTET_STRING, false) || c.fim - c.valor < 2) continue;
    if (b[c.valor] !== 0x30) continue; // conteúdo deve começar com SEQUENCE
    try {
      const interno = lerTlv(b, c.valor, c.fim);
      if (interno.proximo !== c.fim) continue; // o OCTET STRING deve conter exatamente 1 TLV
      const bu = acharEntidadeBU(b, interno, prof + 1);
      if (bu) return bu;
    } catch {
      // não é DER (ex.: assinatura/hash) — ignora
    }
  }
  return null;
}

/**
 * Entre os filhos do BU, o "resultadosVotacaoPorEleicao": SEQ OF SEQ em que cada item começa
 * com INTEGER (idEleicao) e contém ao menos uma SEQ (resultadosVotacao).
 */
function acharResultadosPorEleicao(b: Uint8Array, cs: Tlv[]): Tlv[] | null {
  for (const c of cs) {
    if (!eSeq(c)) continue;
    let itens: Tlv[];
    try {
      itens = filhos(b, c);
    } catch {
      continue;
    }
    if (!itens.length || !itens.every(eSeq)) continue;
    const ok = itens.every((it) => {
      const f = filhos(b, it);
      return f.length >= 3 && eInt(f[0]) && eInt(f[1]) && f.some(eSeq);
    });
    if (ok) return itens;
  }
  return null;
}

/** identificacaoSecao: { SEQ{ municipio, zona }, local, secao } (SEQ universal ou [C0]). */
function lerIdentificacao(b: Uint8Array, cs: Tlv[]): { mun: number; zona: number; local: number | null; secao: number } | null {
  for (const c of cs) {
    if (!c.construido || !(eSeq(c) || eCtx(c, 0))) continue;
    let f: Tlv[];
    try {
      f = filhos(b, c);
    } catch {
      continue;
    }
    if (f.length < 2 || !eSeq(f[0])) continue;
    const mz = filhos(b, f[0]);
    if (mz.length !== 2 || !mz.every(eInt)) continue;
    const ints = f.slice(1).filter(eInt);
    if (!ints.length) continue;
    return {
      mun: lerInteiro(b, mz[0]),
      zona: lerInteiro(b, mz[1]),
      local: ints.length >= 2 ? lerInteiro(b, ints[0]) : null,
      secao: lerInteiro(b, ints[ints.length - 1]),
    };
  }
  return null;
}

/** "20261004T170532" → "2026-10-04T17:05:32" (sem fuso: hora local da urna). */
export function isoLocalDeDataHoraJE(s: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec((s ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null;
}

/**
 * Decodifica um BU (envelope DER do TSE) e extrai o resultado de UM cargo de UMA eleição.
 *  - `idEleicao`: código da eleição (ex.: 6257 = Federal 2026, 1º turno);
 *  - `codigoCargo`: 1 = Presidente.
 * Retorna null quando o BU não contém essa eleição/cargo. Lança `BerError` se o arquivo não for
 * um BU válido (DER malformado ou estrutura irreconhecível).
 * Se o checksum (soma dos votos === comparecimento) falhar, marca `inconsistente` e loga.
 */
export function decodeBU(bytes: Uint8Array, idEleicao: number, codigoCargo = 1): BUDecodificado | null {
  if (!bytes || bytes.length < 2) throw new BerError("Arquivo vazio", 0);
  const raiz = lerTlv(bytes, 0, bytes.length);
  const bu = acharEntidadeBU(bytes, raiz);
  if (!bu) throw new BerError("Estrutura de boletim de urna não encontrada", 0);
  const cs = filhos(bytes, bu);

  const porEleicao = acharResultadosPorEleicao(bytes, cs)!;
  const eleicao = porEleicao.find((it) => lerInteiro(bytes, filhos(bytes, it)[0]) === idEleicao);
  if (!eleicao) return null;

  const fe = filhos(bytes, eleicao);
  const aptos = lerInteiro(bytes, fe[1]);

  // resultadosVotacao → item cujo totaisVotosCargo contém o cargo pedido
  let comparecimento = -1;
  let votaveis: Tlv[] | null = null;
  for (const lista of fe.filter(eSeq)) {
    for (const rv of filhos(bytes, lista)) {
      if (!eSeq(rv)) continue;
      const frv = filhos(bytes, rv);
      const comp = frv.find(eInt);
      for (const totais of frv.filter(eSeq)) {
        for (const tvc of filhos(bytes, totais)) {
          if (!eSeq(tvc)) continue;
          const ftvc = filhos(bytes, tvc);
          // codigoCargo é um CHOICE: [1] cargoConstitucional (ENUM implícito) | [2] consulta livre
          const cod = ftvc.find((x) => x.classe === ClasseTag.Contexto && !x.construido);
          if (!cod || cod.tag !== 1 || lerInteiro(bytes, cod) !== codigoCargo) continue;
          const vv = ftvc.find(eSeq);
          if (!vv) continue;
          votaveis = filhos(bytes, vv);
          comparecimento = comp ? lerInteiro(bytes, comp) : -1;
          break;
        }
        if (votaveis) break;
      }
      if (votaveis) break;
    }
    if (votaveis) break;
  }
  if (!votaveis) return null;

  const votos: Record<string, number> = {};
  let brancos = 0;
  let nulos = 0;
  let legenda = 0;
  let outros = 0;
  const tiposOutros = new Set<number>();
  for (const v of votaveis) {
    if (!eSeq(v)) continue;
    const fv = filhos(bytes, v);
    const tTipo = fv.find((x) => eCtx(x, 1) && !x.construido);
    const tQtd = fv.find((x) => eCtx(x, 2) && !x.construido);
    if (!tTipo || !tQtd) throw new BerError("Votável sem tipoVoto/quantidadeVotos", v.inicio);
    const tipo = lerInteiro(bytes, tTipo);
    const qtd = lerInteiro(bytes, tQtd);
    if (qtd < 0) throw new BerError("Quantidade de votos negativa", tQtd.inicio);
    const tId = fv.find((x) => eCtx(x, 3) && x.construido);
    let codigo: number | null = null;
    if (tId) {
      const ints = filhos(bytes, tId).filter(eInt);
      if (ints.length >= 2) codigo = lerInteiro(bytes, ints[1]);
      else if (ints.length === 1) codigo = lerInteiro(bytes, ints[0]);
    }
    switch (tipo) {
      case TIPO_VOTO.nominal:
        if (codigo == null) throw new BerError("Voto nominal sem identificação do candidato", v.inicio);
        votos[String(codigo)] = (votos[String(codigo)] ?? 0) + qtd;
        break;
      case TIPO_VOTO.branco:
        brancos += qtd;
        break;
      case TIPO_VOTO.nulo:
        nulos += qtd;
        break;
      case TIPO_VOTO.legenda:
        legenda += qtd;
        break;
      default:
        outros += qtd;
        tiposOutros.add(tipo);
    }
  }

  const id = lerIdentificacao(bytes, cs) ?? lerIdentificacao(bytes, filhos(bytes, raiz));
  const tEmissao = cs.find((c) => eTexto(c) && /^\d{8}T\d{6}$/.test(lerTexto(bytes, c)));
  const emissaoRaw = tEmissao ? lerTexto(bytes, tEmissao) : null;

  const out: BUDecodificado = {
    mun: id ? String(id.mun).padStart(5, "0") : "",
    zona: id ? String(id.zona).padStart(4, "0") : "",
    secao: id ? String(id.secao).padStart(4, "0") : "",
    local: id?.local ?? null,
    emissao: isoLocalDeDataHoraJE(emissaoRaw),
    emissaoRaw,
    aptos,
    comparecimento,
    votos,
    brancos,
    nulos,
    legenda,
    outros,
    inconsistente: false,
  };
  const soma = Object.values(votos).reduce((a, n) => a + n, 0) + brancos + nulos + legenda + outros;
  const rotulo = `${out.mun}/${out.zona}/${out.secao}`;
  if (tiposOutros.size) {
    console.warn(`[bu] ${rotulo}: ${outros} voto(s) de tipo(s) não mapeado(s) ${[...tiposOutros].join(",")} (contados como "outros")`);
  }
  if (comparecimento < 0 || soma !== comparecimento) {
    out.inconsistente = true;
    if (comparecimento < 0) out.comparecimento = soma;
    console.warn(`[bu] ${rotulo}: checksum falhou — soma dos votos ${soma} ≠ comparecimento ${comparecimento}`);
  }
  return out;
}
