"use client";
// Tabela ordenável de lugares (estados ou municípios) com Lula/Flávio 2026 e Δ vs 2022/2018.
// Antes da apuração (modo "hist"), mostra apenas 2022 e 2018.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { margem, type LinhaComparacao } from "@/lib/compare";
import { fmtPP, fmtPct } from "@/lib/format";
import type { BlocoId } from "@/lib/types";
import { DeltaPP, Dot, cx } from "./ui";

export interface LinhaLugar {
  id: string;
  nome: string;
  /** texto secundário (ex.: sigla da UF) */
  sub?: string;
  href: string;
  /** % de seções totalizadas em 2026 */
  pa: number | null;
  pt: LinhaComparacao;
  bo: LinhaComparacao;
  lider?: { nome: string; bloco: BlocoId | null } | null;
  /** peso para ordenação padrão (ex.: eleitorado); ordem "peso" */
  peso?: number | null;
  /** selo junto ao nome (ex.: "BU" quando 2026 vem dos boletins de urna do exterior) */
  selo?: { texto: string; titulo: string } | null;
}

type Valor = number | string | null;

interface Coluna {
  id: string;
  rotulo: ReactNode;
  titulo?: string;
  grupo?: BlocoId | "2022" | "2018";
  get: (l: LinhaLugar) => Valor;
  render: (l: LinhaLugar) => ReactNode;
  /** direção inicial ao clicar */
  dir0?: "asc" | "desc";
}

const pctCell = (v: number | null, cor?: string) => (
  <span className="font-semibold" style={cor && v != null ? { color: cor } : undefined}>
    {fmtPct(v, 1)}
  </span>
);

const corTxt = (b: BlocoId) => (b === "pt" ? "var(--c-pt)" : "var(--c-bolso)");

function margemCell(m: number | null, ano: "2022" | "2018") {
  if (m == null) return <span className="text-muted">—</span>;
  const b: BlocoId = m >= 0 ? "pt" : "bolso";
  const nome = BLOCOS[b].nomes[ano].replace(" Bolsonaro", "");
  return (
    <span className="whitespace-nowrap font-medium" style={{ color: corTxt(b) }} title={`${nome} ${fmtPP(m)}`}>
      {nome} +{fmtPP(Math.abs(m)).replace(/^[+±−]/, "").replace(" p.p.", "")}
    </span>
  );
}

function colunasLive(mostrarLider: boolean): Coluna[] {
  const cols: Coluna[] = [
    {
      id: "pa",
      rotulo: "% apurado",
      get: (l) => l.pa,
      render: (l) => <span className="text-muted">{fmtPct(l.pa, 1)}</span>,
    },
    { id: "pt26", grupo: "pt", rotulo: "2026", get: (l) => l.pt.p2026, render: (l) => pctCell(l.pt.p2026, corTxt("pt")) },
    { id: "pt22", grupo: "pt", rotulo: "Δ 22", titulo: "Variação vs Lula 2022", get: (l) => l.pt.d22, render: (l) => <DeltaPP v={l.pt.d22} semSufixo /> },
    { id: "pt18", grupo: "pt", rotulo: "Δ 18", titulo: "Variação vs Haddad 2018", get: (l) => l.pt.d18, render: (l) => <DeltaPP v={l.pt.d18} semSufixo /> },
    { id: "bo26", grupo: "bolso", rotulo: "2026", get: (l) => l.bo.p2026, render: (l) => pctCell(l.bo.p2026, corTxt("bolso")) },
    { id: "bo22", grupo: "bolso", rotulo: "Δ 22", titulo: "Variação vs Jair 2022", get: (l) => l.bo.d22, render: (l) => <DeltaPP v={l.bo.d22} semSufixo /> },
    { id: "bo18", grupo: "bolso", rotulo: "Δ 18", titulo: "Variação vs Jair 2018", get: (l) => l.bo.d18, render: (l) => <DeltaPP v={l.bo.d18} semSufixo /> },
  ];
  if (mostrarLider) {
    cols.push({
      id: "lider",
      rotulo: "Líder",
      dir0: "asc",
      get: (l) => l.lider?.nome ?? null,
      render: (l) =>
        l.lider ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Dot cor={l.lider.bloco ? BLOCOS[l.lider.bloco].cor : "var(--c-outros)"} />
            {l.lider.nome}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    });
  }
  return cols;
}

function colunasHist(): Coluna[] {
  return [
    { id: "pt22h", grupo: "2022", rotulo: "Lula", get: (l) => l.pt.p2022, render: (l) => pctCell(l.pt.p2022, corTxt("pt")) },
    { id: "bo22h", grupo: "2022", rotulo: "Jair", get: (l) => l.bo.p2022, render: (l) => pctCell(l.bo.p2022, corTxt("bolso")) },
    {
      id: "m22",
      grupo: "2022",
      rotulo: "Margem",
      get: (l) => margem(l.pt.p2022, l.bo.p2022),
      render: (l) => margemCell(margem(l.pt.p2022, l.bo.p2022), "2022"),
    },
    { id: "pt18h", grupo: "2018", rotulo: "Haddad", get: (l) => l.pt.p2018, render: (l) => pctCell(l.pt.p2018, corTxt("pt")) },
    { id: "bo18h", grupo: "2018", rotulo: "Jair", get: (l) => l.bo.p2018, render: (l) => pctCell(l.bo.p2018, corTxt("bolso")) },
    {
      id: "m18",
      grupo: "2018",
      rotulo: "Margem",
      get: (l) => margem(l.pt.p2018, l.bo.p2018),
      render: (l) => margemCell(margem(l.pt.p2018, l.bo.p2018), "2018"),
    },
  ];
}

const getNome = (l: LinhaLugar) => l.nome;
const getPeso = (l: LinhaLugar) => l.peso ?? null;

function comparar(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  // nulos sempre no fim, independentemente da direção
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

const GRUPOS: Record<string, { rotulo: string; cor?: string }> = {
  pt: { rotulo: "Lula / Haddad", cor: BLOCOS.pt.cor },
  bolso: { rotulo: "Flávio / Jair", cor: BLOCOS.bolso.cor },
  "2022": { rotulo: "2022 (final)" },
  "2018": { rotulo: "2018 (final)" },
};

export default function TabelaComparativa({
  linhas,
  modo,
  rotuloLugar,
  mostrarLider = false,
  rodape,
  pagina,
  caption,
  ordemInicial,
  resetPagina,
}: {
  linhas: LinhaLugar[];
  modo: "live" | "hist";
  rotuloLugar: string;
  mostrarLider?: boolean;
  /** linha fixa no rodapé (ex.: total Brasil) — não entra na ordenação */
  rodape?: LinhaLugar | null;
  /** quantidade inicial exibida; "mostrar mais" acrescenta o mesmo tanto. Sem valor = todas. */
  pagina?: number;
  caption: string;
  ordemInicial?: { col: string; dir: "asc" | "desc" };
  /** quando muda (ex.: texto do filtro), volta para a primeira página sem perder a ordenação */
  resetPagina?: string;
}) {
  const router = useRouter();
  const cols = useMemo(() => (modo === "live" ? colunasLive(mostrarLider) : colunasHist()), [modo, mostrarLider]);
  const padrao = ordemInicial ?? { col: "nome", dir: "asc" as const };
  const [ordemSel, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>(padrao);
  // coluna escolhida pode não existir após trocar de modo (ao vivo ↔ histórico): volta ao padrão
  const ordem =
    ordemSel.col === "nome" || ordemSel.col === "peso" || cols.some((c) => c.id === ordemSel.col) ? ordemSel : padrao;
  const [limite, setLimite] = useState(pagina ?? Infinity);
  const [chavePagina, setChavePagina] = useState(resetPagina);
  if (chavePagina !== resetPagina) {
    // ajuste de estado durante a renderização (padrão recomendado pelo React)
    setChavePagina(resetPagina);
    setLimite(pagina ?? Infinity);
  }

  const colNome: Coluna = {
    id: "nome",
    rotulo: rotuloLugar,
    dir0: "asc",
    get: getNome,
    render: getNome,
  };

  const { col: colOrdem, dir: dirOrdem } = ordem;
  const ordenadas = useMemo(() => {
    const get =
      colOrdem === "nome" ? getNome : colOrdem === "peso" ? getPeso : (cols.find((c) => c.id === colOrdem)?.get ?? getNome);
    const arr = linhas.slice();
    arr.sort((a, b) => comparar(get(a), get(b), dirOrdem) || a.nome.localeCompare(b.nome, "pt-BR"));
    return arr;
  }, [linhas, colOrdem, dirOrdem, cols]);

  const visiveis = Number.isFinite(limite) ? ordenadas.slice(0, limite) : ordenadas;

  function clicar(c: Coluna) {
    setOrdem(ordem.col === c.id ? { col: c.id, dir: ordem.dir === "asc" ? "desc" : "asc" } : { col: c.id, dir: c.dir0 ?? "desc" });
  }

  function th(c: Coluna, extra?: string) {
    const ativo = ordem.col === c.id;
    return (
      <th
        key={c.id}
        scope="col"
        aria-sort={ativo ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cx("whitespace-nowrap px-2 py-1.5 font-medium", c.id === "nome" ? "text-left" : "text-right", extra)}
      >
        <button
          type="button"
          onClick={() => clicar(c)}
          title={c.titulo ? `${c.titulo} — ordenar` : "Ordenar"}
          className={cx("inline-flex items-center gap-1 hover:text-fg", ativo ? "text-strong" : "text-muted")}
        >
          {c.rotulo}
          <span aria-hidden className="text-[10px]">
            {ativo ? (ordem.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  // cabeçalho em dois níveis: grupos (blocos ou anos)
  const grupos: { id: string; span: number }[] = [];
  for (const c of cols) {
    const g = c.grupo ?? "";
    const ult = grupos[grupos.length - 1];
    if (ult && ult.id === g) ult.span++;
    else grupos.push({ id: g, span: 1 });
  }

  const linhaTr = (l: LinhaLugar, fixa?: boolean) => (
    <tr
      key={l.id}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(l.href);
      }}
      className={cx("group cursor-pointer hover:bg-surface-2", fixa && "border-t-2 border-line font-semibold")}
    >
      <th scope="row" className="col-fixa max-w-[13rem] px-2 py-1.5 text-left font-medium group-hover:bg-surface-2">
        <Link href={l.href} className="block truncate text-strong hover:underline">
          {l.nome}
          {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
          {l.selo && (
            <span
              title={l.selo.titulo}
              className="ml-1.5 rounded border border-line bg-surface-2 px-1 py-px align-[1px] text-[10px] font-semibold tracking-wide text-muted"
            >
              {l.selo.texto}
              <span className="sr-only"> — {l.selo.titulo}</span>
            </span>
          )}
        </Link>
      </th>
      {cols.map((c) => (
        <td key={c.id} className="whitespace-nowrap px-2 py-1.5 text-right">
          {c.render(l)}
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      <div className="tabela-scroll rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">{caption}. Clique no cabeçalho de uma coluna para ordenar.</caption>
          <thead className="bg-surface text-xs">
            <tr>
              <td className="col-fixa" />
              {grupos.map((g, i) =>
                g.id ? (
                  <th
                    key={`${g.id}-${i}`}
                    scope="colgroup"
                    colSpan={g.span}
                    className="border-b-2 px-2 pt-2 text-center text-xs font-semibold"
                    style={{ borderColor: GRUPOS[g.id]?.cor ?? "var(--line)", color: GRUPOS[g.id]?.cor ? corTxt(g.id as BlocoId) : undefined }}
                  >
                    {GRUPOS[g.id]?.rotulo ?? g.id}
                  </th>
                ) : (
                  <th key={`v-${i}`} colSpan={g.span} />
                ),
              )}
            </tr>
            <tr className="border-b border-line">
              {th(colNome, "col-fixa")}
              {cols.map((c) => th(c))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{visiveis.map((l) => linhaTr(l))}</tbody>
          {rodape && <tfoot>{linhaTr(rodape, true)}</tfoot>}
        </table>
      </div>
      {ordenadas.length > visiveis.length && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <span className="text-muted">
            Mostrando {visiveis.length} de {ordenadas.length}
          </span>
          <button
            type="button"
            onClick={() => setLimite((n) => n + (pagina ?? 50))}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 font-medium hover:bg-surface-2"
          >
            Mostrar mais
          </button>
          <button type="button" onClick={() => setLimite(Infinity)} className="text-muted underline underline-offset-2 hover:text-fg">
            Mostrar todos
          </button>
        </div>
      )}
    </div>
  );
}
