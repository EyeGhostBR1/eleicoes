"use client";
// Tabela ordenável de países (boletins de urna do exterior) com Lula/Flávio 2026 e 2022/2018.
// Clique num país para ver as cidades. Países sem boletins ficam no fim, em cinza, só com histórico.
import Link from "next/link";
import { Fragment, type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { deltaPP, normalizar } from "@/lib/compare";
import { histPorPais } from "@/lib/exterior/paises";
import { fmtInt, fmtPct } from "@/lib/format";
import type { BlocoId, ExteriorResponse, HistMunFile, Turno } from "@/lib/types";
import { DeltaPP, Dot, Segmentado, cx } from "../ui";
import { type BaseHist, type LinhaExt, linhasCidades, linhasPaises } from "./dados";
import { Bandeira, MiniProgresso } from "./partes";

type Valor = number | string | null;

interface Coluna {
  id: string;
  rotulo: ReactNode;
  titulo?: string;
  grupo?: BlocoId;
  get: (l: LinhaExt) => Valor;
  render: (l: LinhaExt) => ReactNode;
  dir0?: "asc" | "desc";
  /** separador à esquerda (início de grupo) */
  sep?: boolean;
}

const corTxt = (b: BlocoId) => (b === "pt" ? "var(--c-pt)" : "var(--c-bolso)");

const pct26 = (v: number | null, b: BlocoId) => (
  <span className="font-semibold" style={v != null ? { color: corTxt(b) } : undefined}>
    {fmtPct(v, 1)}
  </span>
);
const pctHist = (v: number | null) => <span className="text-fg">{fmtPct(v, 1)}</span>;

function SecoesCell({ l }: { l: LinhaExt }) {
  if (l.secoesTotal == null) return <span className="text-muted">{l.secoesRecebidas ? fmtInt(l.secoesRecebidas) : "—"}</span>;
  return (
    <span className="inline-flex w-[5.5rem] flex-col items-end gap-0.5" title={`${fmtPct(l.pa, 1)} das seções recebidas`}>
      <span className={cx("text-xs", l.secoesRecebidas >= l.secoesTotal ? "font-medium text-fg" : "text-muted")}>
        {fmtInt(l.secoesRecebidas)}/{fmtInt(l.secoesTotal)}
      </span>
      <MiniProgresso v={l.pa} />
    </span>
  );
}

const COLUNAS: Coluna[] = [
  { id: "sec", rotulo: "Seções", titulo: "Seções com boletim recebido / total", get: (l) => l.pa, render: (l) => <SecoesCell l={l} /> },
  {
    id: "vv",
    rotulo: "Válidos",
    titulo: "Votos válidos nos boletins recebidos (2026)",
    get: (l) => l.validos,
    render: (l) => <span className="text-muted">{fmtInt(l.validos)}</span>,
  },
  { id: "pt26", grupo: "pt", sep: true, rotulo: "2026", titulo: "Lula 2026 (boletins)", get: (l) => l.pt.p2026, render: (l) => pct26(l.pt.p2026, "pt") },
  { id: "pt22", grupo: "pt", rotulo: "2022", titulo: "Lula 2022", get: (l) => l.pt.p2022, render: (l) => pctHist(l.pt.p2022) },
  { id: "dpt22", grupo: "pt", rotulo: "Δ 22", titulo: "Lula 2026 − Lula 2022 (p.p.)", get: (l) => l.pt.d22, render: (l) => <DeltaPP v={l.pt.d22} semSufixo /> },
  { id: "pt18", grupo: "pt", rotulo: "2018", titulo: "Haddad 2018", get: (l) => l.pt.p2018, render: (l) => pctHist(l.pt.p2018) },
  { id: "dpt18", grupo: "pt", rotulo: "Δ 18", titulo: "Lula 2026 − Haddad 2018 (p.p.)", get: (l) => l.pt.d18, render: (l) => <DeltaPP v={l.pt.d18} semSufixo /> },
  { id: "bo26", grupo: "bolso", sep: true, rotulo: "2026", titulo: "Flávio 2026 (boletins)", get: (l) => l.bo.p2026, render: (l) => pct26(l.bo.p2026, "bolso") },
  { id: "bo22", grupo: "bolso", rotulo: "2022", titulo: "Jair 2022", get: (l) => l.bo.p2022, render: (l) => pctHist(l.bo.p2022) },
  { id: "dbo22", grupo: "bolso", rotulo: "Δ 22", titulo: "Flávio 2026 − Jair 2022 (p.p.)", get: (l) => l.bo.d22, render: (l) => <DeltaPP v={l.bo.d22} semSufixo /> },
  { id: "bo18", grupo: "bolso", rotulo: "2018", titulo: "Jair 2018", get: (l) => l.bo.p2018, render: (l) => pctHist(l.bo.p2018) },
  { id: "dbo18", grupo: "bolso", rotulo: "Δ 18", titulo: "Flávio 2026 − Jair 2018 (p.p.)", get: (l) => l.bo.d18, render: (l) => <DeltaPP v={l.bo.d18} semSufixo /> },
  {
    id: "lider",
    rotulo: "Líder 2026",
    sep: true,
    dir0: "asc",
    get: (l) => l.lider?.nome ?? null,
    render: (l) =>
      l.lider ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${l.lider.nome}: ${fmtPct(l.lider.pct, 1)} dos válidos`}>
          <Dot cor={l.lider.bloco ? BLOCOS[l.lider.bloco].cor : "var(--c-outros)"} />
          {l.lider.nome}
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
];

/** Colunas "1º turno de 2026" (só na página do 2º turno), logo após a coluna 2026 de cada bloco. */
const COLUNAS_T1: Record<BlocoId, Coluna[]> = {
  pt: [
    { id: "pt1", grupo: "pt", rotulo: "1º T", titulo: "Lula no 1º turno de 2026 (mesma base)", get: (l) => l.t1?.pt ?? null, render: (l) => pctHist(l.t1?.pt ?? null) },
    {
      id: "dpt1",
      grupo: "pt",
      rotulo: "Δ 1º",
      titulo: "Lula 2º turno − Lula 1º turno (p.p.)",
      get: (l) => deltaPP(l.pt.p2026, l.t1?.pt),
      render: (l) => <DeltaPP v={deltaPP(l.pt.p2026, l.t1?.pt)} semSufixo />,
    },
  ],
  bolso: [
    { id: "bo1", grupo: "bolso", rotulo: "1º T", titulo: "Flávio no 1º turno de 2026 (mesma base)", get: (l) => l.t1?.bo ?? null, render: (l) => pctHist(l.t1?.bo ?? null) },
    {
      id: "dbo1",
      grupo: "bolso",
      rotulo: "Δ 1º",
      titulo: "Flávio 2º turno − Flávio 1º turno (p.p.)",
      get: (l) => deltaPP(l.bo.p2026, l.t1?.bo),
      render: (l) => <DeltaPP v={deltaPP(l.bo.p2026, l.t1?.bo)} semSufixo />,
    },
  ],
};

function colunasPara(comT1: boolean): Coluna[] {
  if (!comT1) return COLUNAS;
  return COLUNAS.flatMap((c) => (c.id === "pt26" ? [c, ...COLUNAS_T1.pt] : c.id === "bo26" ? [c, ...COLUNAS_T1.bolso] : [c]));
}

const GRUPOS: Record<BlocoId, { rotulo: string; cor: string }> = {
  pt: { rotulo: "Lula / Haddad", cor: BLOCOS.pt.cor },
  bolso: { rotulo: "Flávio / Jair", cor: BLOCOS.bolso.cor },
};

function compararValor(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

export default function TabelaPaises({
  ext,
  histZz,
  turno,
  qs,
  nomeCidade,
  ext1,
}: {
  /** 2º turno: boletins do 1º turno de 2026, para as colunas de comparação */
  ext1?: ExteriorResponse;
  ext: ExteriorResponse | undefined;
  histZz: HistMunFile | undefined;
  turno: Turno;
  qs: string;
  /** nome de cidade quando a API ainda não respondeu */
  nomeCidade: (cd: string) => string | undefined;
}) {
  const [base, setBase] = useState<BaseHist>("mesmas");
  const [mostrarSem, setMostrarSem] = useState(false);
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "vv", dir: "desc" });
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [filtro, setFiltro] = useState("");
  const filtroDef = useDeferredValue(filtro);

  const histPais = useMemo(() => histPorPais(histZz), [histZz]);
  const linhas = useMemo(
    () => linhasPaises(ext, histZz, turno, base, histPais, ext1),
    [ext, histZz, turno, base, histPais, ext1],
  );
  const colunas = useMemo(() => colunasPara(!!ext1), [ext1]);

  const get = useMemo(() => {
    if (ordem.col === "nome") return (l: LinhaExt) => l.nome;
    return colunas.find((c) => c.id === ordem.col)?.get ?? ((l: LinhaExt) => l.nome);
  }, [ordem.col, colunas]);
  const ordenar = useMemo(
    () => (arr: LinhaExt[]) =>
      arr.slice().sort((a, b) => compararValor(get(a), get(b), ordem.dir) || a.nome.localeCompare(b.nome, "pt-BR")),
    [get, ordem.dir],
  );

  const q = normalizar(filtroDef);
  const filtradas = q ? linhas.filter((l) => normalizar(l.nome).includes(q)) : linhas;
  const com = ordenar(filtradas.filter((l) => l.secoesRecebidas > 0));
  const sem = ordenar(filtradas.filter((l) => l.secoesRecebidas <= 0));
  const nSem = linhas.filter((l) => l.secoesRecebidas <= 0).length;
  const nCom = linhas.length - nSem;
  // sem nenhum boletim (antes da recepção / 2º turno / carregando): mostra todos com o histórico
  const exibirSem = mostrarSem || nCom === 0 || (!!q && com.length === 0);
  const temParcial = com.some((l) => l.baseParcial);

  function clicar(id: string, dir0: "asc" | "desc" = "desc") {
    setOrdem((o) => (o.col === id ? { col: id, dir: o.dir === "asc" ? "desc" : "asc" } : { col: id, dir: dir0 }));
  }
  function alternar(id: string) {
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function th(id: string, rotulo: ReactNode, titulo: string | undefined, dir0: "asc" | "desc" | undefined, extra?: string) {
    const ativo = ordem.col === id;
    return (
      <th
        key={id}
        scope="col"
        aria-sort={ativo ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cx("whitespace-nowrap px-2 py-1.5 font-medium", id === "nome" ? "text-left" : "text-right", extra)}
      >
        <button
          type="button"
          onClick={() => clicar(id, dir0)}
          title={titulo ? `${titulo} — ordenar` : "Ordenar"}
          className={cx("inline-flex items-center gap-1 hover:text-fg", ativo ? "text-strong" : "text-muted")}
        >
          {rotulo}
          <span aria-hidden className="text-[10px]">
            {ativo ? (ordem.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  const celulas = (l: LinhaExt) =>
    colunas.map((c) => (
      <td key={c.id} className={cx("whitespace-nowrap px-2 py-1.5 text-right", c.sep && "border-l border-line")}>
        {c.render(l)}
      </td>
    ));

  function linhaPais(l: LinhaExt, cinza: boolean) {
    const aberto = abertos.has(l.id);
    const nCid = l.cidades?.length ?? 0;
    const idCidades = `cid-${l.id.replace(/\W+/g, "-")}`;
    return (
      <tr
        key={l.id}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          alternar(l.id);
        }}
        className={cx("group cursor-pointer hover:bg-surface-2", cinza && "text-muted [&_td]:opacity-60", aberto && "bg-surface-2/60")}
      >
        <th scope="row" className="col-fixa max-w-[14rem] px-2 py-1.5 text-left font-medium group-hover:bg-surface-2">
          <button
            type="button"
            onClick={() => alternar(l.id)}
            aria-expanded={aberto}
            aria-controls={aberto ? idCidades : undefined}
            className="flex w-full min-w-0 items-center gap-1.5 text-left"
            title={aberto ? "Ocultar cidades" : "Ver cidades"}
          >
            <span aria-hidden className={cx("w-3 shrink-0 text-[10px] text-muted transition-transform", aberto && "rotate-90")}>
              ▶
            </span>
            <Bandeira iso2={l.iso2} />
            <span className={cx("truncate", cinza ? "text-muted" : "text-strong")}>{l.nome}</span>
            {l.baseParcial && (
              <span
                className="shrink-0 text-xs font-normal text-muted"
                title={`Recebimento parcial: 2022/2018 somados só nas ${l.baseParcial.n} de ${l.baseParcial.de} cidades com boletins, com peso proporcional às seções recebidas`}
              >
                *
              </span>
            )}
            {nCid > 1 && <span className="shrink-0 text-[11px] font-normal text-muted">{nCid} cid.</span>}
          </button>
        </th>
        {celulas(l)}
      </tr>
    );
  }

  function linhasDasCidades(l: LinhaExt) {
    if (!abertos.has(l.id) || !l.cidades?.length) return null;
    const cids = ordenar(linhasCidades(l.cidades, ext, histZz, turno, nomeCidade, qs, ext1));
    const idCidades = `cid-${l.id.replace(/\W+/g, "-")}`;
    return cids.map((c, i) => (
      <tr
        key={`${l.id}:${c.id}`}
        id={i === 0 ? idCidades : undefined}
        className={cx("bg-surface-2/40 text-[13px]", c.secoesRecebidas <= 0 && "text-muted [&_td]:opacity-60")}
      >
        <th scope="row" className="col-fixa max-w-[14rem] py-1 pl-8 pr-2 text-left font-normal">
          <Link href={c.href ?? "#"} className="block truncate text-fg hover:underline" title={`${c.nome} — página da cidade`}>
            {c.nome}
            {c.semHist && <span className="ml-1 text-[11px] text-muted">(nova)</span>}
          </Link>
        </th>
        {celulas(c)}
      </tr>
    ));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor="filtro-pais" className="sr-only">
          Filtrar países
        </label>
        <input
          id="filtro-pais"
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar países…"
          autoComplete="off"
          className="h-9 w-full max-w-[14rem] rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Base 2022/2018:</span>
          <Segmentado<BaseHist>
            rotulo="Base de comparação com 2022 e 2018"
            tamanho="xs"
            valor={base}
            onChange={setBase}
            opcoes={[
              { valor: "mesmas", rotulo: "Mesmas cidades", titulo: "Soma 2022/2018 só nas cidades do país que já têm boletins" },
              { valor: "pais", rotulo: "País inteiro", titulo: "Resultado final de 2022/2018 no país inteiro" },
            ]}
          />
        </div>
        {nCom > 0 && nSem > 0 && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={mostrarSem}
              onChange={(e) => setMostrarSem(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
            Mostrar países sem boletins ({fmtInt(nSem)})
          </label>
        )}
      </div>

      <div className="tabela-scroll rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[64rem] text-sm">
          <caption className="sr-only">
            Resultados por país no exterior: Lula e Flávio em 2026 (boletins de urna recebidos) e variação em p.p. vs 2022 e
            2018. Clique no cabeçalho para ordenar e no país para ver as cidades.
          </caption>
          <thead className="bg-surface text-xs">
            <tr>
              <td className="col-fixa" />
              <th colSpan={2} />
              {(["pt", "bolso"] as const).map((g) => (
                <th
                  key={g}
                  scope="colgroup"
                  colSpan={ext1 ? 7 : 5}
                  className="border-b-2 border-l border-l-line px-2 pt-2 text-center text-xs font-semibold"
                  style={{ borderBottomColor: GRUPOS[g].cor, color: corTxt(g) }}
                >
                  {GRUPOS[g].rotulo}
                </th>
              ))}
              <th className="border-l border-line" />
            </tr>
            <tr className="border-b border-line">
              {th("nome", "País", "Nome do país", "asc", "col-fixa")}
              {colunas.map((c) => th(c.id, c.rotulo, c.titulo, c.dir0, c.sep ? "border-l border-line" : undefined))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {com.map((l) => (
              <Fragment key={l.id}>
                {linhaPais(l, false)}
                {linhasDasCidades(l)}
              </Fragment>
            ))}
            {exibirSem && sem.length > 0 && nCom > 0 && com.length > 0 && (
              <tr>
                <td colSpan={colunas.length + 1} className="bg-surface-2 px-2 py-1 text-xs font-medium text-muted">
                  Sem boletins recebidos ainda — apenas 2022 e 2018
                </td>
              </tr>
            )}
            {exibirSem &&
              sem.map((l) => (
                <Fragment key={l.id}>
                  {linhaPais(l, nCom > 0)}
                  {linhasDasCidades(l)}
                </Fragment>
              ))}
            {com.length === 0 && (!exibirSem || sem.length === 0) && (
              <tr>
                <td colSpan={colunas.length + 1} className="px-3 py-4 text-center text-sm text-muted">
                  Nenhum país encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Clique num país para ver as cidades. Δ = 2026 menos o ano de referência, em pontos percentuais dos válidos.
        {temParcial &&
          base === "mesmas" &&
          " * País com recebimento parcial: 2022/2018 somados só nas cidades que já têm boletins, com peso proporcional às seções recebidas."}
        {nCom > 0 && !mostrarSem && nSem > 0 && ` ${fmtInt(nSem)} países ainda sem boletins estão ocultos.`}
      </p>
    </div>
  );
}
