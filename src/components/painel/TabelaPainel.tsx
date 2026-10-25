"use client";
// Tabela ordenável do painel: colunas declarativas (com grupos no cabeçalho), filtro por nome,
// paginação ("mostrar mais") e linha fixa de total no rodapé.
import Link from "next/link";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { normalizar } from "@/lib/compare";
import { fmtInt } from "@/lib/format";
import { cx } from "../ui";

export type Valor = number | string | null;

export interface ColunaPainel<T> {
  id: string;
  rotulo: ReactNode;
  titulo: string;
  get: (l: T) => Valor;
  render: (l: T) => ReactNode;
  /** grupo do cabeçalho (colunas consecutivas com o mesmo grupo são unidas) */
  grupo?: string;
  dir0?: "asc" | "desc";
}

export interface LinhaBase {
  id: string;
  nome: string;
  sub?: string;
  href?: string;
  /** peso para a ordem inicial (maior primeiro) */
  peso: number;
  /** destaca a linha (ex.: liderança virou) */
  destaque?: boolean;
}

function comparar(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

export default function TabelaPainel<T extends LinhaBase>({
  linhas,
  colunas,
  grupos = {},
  rotuloLugar,
  plural,
  rodape,
  pagina = 30,
  caption,
  onSelecionar,
}: {
  linhas: T[];
  colunas: ColunaPainel<T>[];
  /** rótulo e cor (borda) de cada grupo */
  grupos?: Record<string, { rotulo: string; cor?: string }>;
  rotuloLugar: string;
  plural: string;
  rodape?: T | null;
  pagina?: number;
  caption: string;
  /** clique no nome (em vez de link) */
  onSelecionar?: (l: T) => void;
}) {
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "peso", dir: "desc" });
  const [filtro, setFiltro] = useState("");
  const [limite, setLimite] = useState(pagina);
  const filtroDef = useDeferredValue(filtro);

  const ordenadas = useMemo(() => {
    const q = normalizar(filtroDef);
    const base = q ? linhas.filter((l) => normalizar(l.nome).includes(q)) : linhas;
    const get =
      ordem.col === "nome"
        ? (l: T) => l.nome
        : ordem.col === "peso"
          ? (l: T) => l.peso
          : (colunas.find((c) => c.id === ordem.col)?.get ?? ((l: T) => l.nome));
    return base.slice().sort((a, b) => comparar(get(a), get(b), ordem.dir) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas, colunas, filtroDef, ordem]);
  const visiveis = ordenadas.slice(0, limite);

  const faixas: { id: string; span: number }[] = [];
  for (const c of colunas) {
    const g = c.grupo ?? "";
    const ult = faixas[faixas.length - 1];
    if (ult && ult.id === g) ult.span++;
    else faixas.push({ id: g, span: 1 });
  }
  const inicioGrupo = new Set<string>();
  colunas.forEach((c, i) => {
    if (c.grupo && c.grupo !== colunas[i - 1]?.grupo) inicioGrupo.add(c.id);
  });

  const th = (id: string, rotulo: ReactNode, titulo: string, dir0: "asc" | "desc", extra?: string) => {
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
          title={`${titulo} — ordenar`}
          onClick={() => setOrdem(ativo ? { col: id, dir: ordem.dir === "asc" ? "desc" : "asc" } : { col: id, dir: dir0 })}
          className={cx("inline-flex items-center gap-1 hover:text-fg", ativo ? "text-strong" : "text-muted")}
        >
          {rotulo}
          <span aria-hidden className="text-[10px]">
            {ativo ? (ordem.dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  const nomeCel = (l: T) => {
    const txt = (
      <>
        {l.nome}
        {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
      </>
    );
    if (onSelecionar)
      return (
        <button type="button" onClick={() => onSelecionar(l)} className="block max-w-full truncate text-left text-strong hover:underline">
          {txt}
        </button>
      );
    return l.href ? (
      <Link href={l.href} className="block truncate text-strong hover:underline">
        {txt}
      </Link>
    ) : (
      <span className="block truncate text-strong">{txt}</span>
    );
  };

  const tr = (l: T, fixa?: boolean) => (
    <tr key={l.id} className={cx("hover:bg-surface-2", fixa && "border-t-2 border-line font-semibold", l.destaque && !fixa && "bg-warn-bg/25")}>
      <th scope="row" className="col-fixa max-w-[13rem] px-2 py-1.5 text-left font-medium">
        {nomeCel(l)}
      </th>
      {colunas.map((c) => (
        <td key={c.id} className={cx("whitespace-nowrap px-2 py-1.5 text-right", inicioGrupo.has(c.id) && "border-l border-line")}>
          {c.render(l)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-2">
      {linhas.length > 15 && (
        <input
          type="search"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setLimite(pagina);
          }}
          placeholder={`Filtrar ${plural}…`}
          aria-label={`Filtrar ${plural}`}
          autoComplete="off"
          className="h-9 w-full max-w-xs rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
        />
      )}
      <div className="tabela-scroll rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}. Clique no cabeçalho de uma coluna para ordenar.</caption>
          <thead className="bg-surface text-xs">
            <tr>
              <td className="col-fixa" />
              {faixas.map((g, i) =>
                g.id ? (
                  <th
                    key={`${g.id}-${i}`}
                    scope="colgroup"
                    colSpan={g.span}
                    className="border-b-2 border-l border-l-line px-2 pt-2 text-center text-xs font-semibold text-strong"
                    style={{ borderBottomColor: grupos[g.id]?.cor ?? "var(--line)" }}
                  >
                    {grupos[g.id]?.rotulo ?? g.id}
                  </th>
                ) : (
                  <th key={`v-${i}`} colSpan={g.span} />
                ),
              )}
            </tr>
            <tr className="border-b border-line">
              {th("nome", rotuloLugar, `Nome do ${rotuloLugar.toLowerCase()}`, "asc", "col-fixa")}
              {colunas.map((c) => th(c.id, c.rotulo, c.titulo, c.dir0 ?? "desc", inicioGrupo.has(c.id) ? "border-l border-line" : undefined))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{visiveis.map((l) => tr(l))}</tbody>
          {rodape && <tfoot>{tr(rodape, true)}</tfoot>}
        </table>
      </div>
      {ordenadas.length > visiveis.length && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <span className="text-muted">
            Mostrando {fmtInt(visiveis.length)} de {fmtInt(ordenadas.length)}
          </span>
          <button
            type="button"
            onClick={() => setLimite((n) => n + pagina)}
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
