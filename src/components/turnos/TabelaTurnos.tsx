"use client";
// Tabela 1º × 2º turno de 2026, lado a lado por candidato (como a tabela 2026 × 2022 × 2018):
// para Lula e para Flávio, votos no 1º turno, votos no 2º turno, votos a mais/a menos e
// crescimento %. Ordenável, com filtro, paginação e linha de total no rodapé.
// Diferença e crescimento só aparecem com a apuração do 2º turno concluída no lugar.
import Link from "next/link";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { normalizar } from "@/lib/compare";
import { fmtInt, fmtPct } from "@/lib/format";
import type { DeltaTurno, LinhaTurnos } from "@/lib/turnos";
import type { BlocoId } from "@/lib/types";
import { Card, Dot, SectionTitle, SkeletonLinhas, cx } from "../ui";
import { Crescimento, DeltaVotos } from "./ComparacaoTurnos";

type Valor = number | string | null;

interface Coluna {
  id: string;
  rotulo: ReactNode;
  titulo: string;
  grupo?: BlocoId;
  get: (l: LinhaTurnos) => Valor;
  render: (l: LinhaTurnos) => ReactNode;
  dir0?: "asc" | "desc";
}

const corTxt = (b: BlocoId) => (b === "pt" ? "var(--c-pt)" : "var(--c-bolso)");
const d = (l: LinhaTurnos, b: BlocoId): DeltaTurno => (b === "pt" ? l.pt : l.bo);

function Votos({ v, p, cor, parcial }: { v: number | null; p: number | null; cor?: string; parcial?: boolean }) {
  if (v == null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>
        {fmtInt(v)}
      </span>
      <span className="text-[11px] text-muted">
        {fmtPct(p, 1)}
        {parcial && " · parcial"}
      </span>
    </span>
  );
}

const apurando = <span className="text-xs text-muted">apurando</span>;

function colunasBloco(b: BlocoId): Coluna[] {
  const nome = BLOCOS[b].nomes["2026"].replace(" Bolsonaro", "");
  return [
    {
      id: `${b}1`,
      grupo: b,
      rotulo: "1º turno",
      titulo: `Votos de ${nome} no 1º turno (e % dos válidos)`,
      get: (l) => d(l, b).v1,
      render: (l) => <Votos v={d(l, b).v1} p={d(l, b).p1} />,
    },
    {
      id: `${b}2`,
      grupo: b,
      rotulo: "2º turno",
      titulo: `Votos de ${nome} no 2º turno (e % dos válidos)`,
      get: (l) => (l.t2 ? d(l, b).v2 : null),
      render: (l) => (l.t2 ? <Votos v={d(l, b).v2} p={d(l, b).p2} cor={corTxt(b)} parcial={!l.completo} /> : <span className="text-muted">—</span>),
    },
    {
      id: `${b}dv`,
      grupo: b,
      rotulo: "Δ votos",
      titulo: `Votos a mais / a menos de ${nome} no 2º turno em relação ao 1º`,
      get: (l) => d(l, b).dv,
      render: (l) => (l.t2 && !l.completo ? apurando : <DeltaVotos v={d(l, b).dv} />),
    },
    {
      id: `${b}cr`,
      grupo: b,
      rotulo: "Cresc.",
      titulo: `Crescimento dos votos de ${nome} em relação aos votos dele no 1º turno (%)`,
      get: (l) => d(l, b).cresc,
      render: (l) => (l.t2 && !l.completo ? apurando : <Crescimento v={d(l, b).cresc} />),
    },
  ];
}

function Lider({ b }: { b: BlocoId | null }) {
  if (!b) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1" title={b === "pt" ? "Lula à frente" : "Flávio à frente"}>
      <Dot cor={BLOCOS[b].cor} />
      {b === "pt" ? "Lula" : "Flávio"}
    </span>
  );
}

const COLUNAS: Coluna[] = [
  {
    id: "pa",
    rotulo: "Apurado",
    titulo: "% apurado no 2º turno",
    get: (l) => l.t2?.pa ?? null,
    render: (l) => <span className={l.completo ? "text-fg" : "text-muted"}>{l.t2 ? fmtPct(l.t2.pa, 1) : "—"}</span>,
  },
  ...colunasBloco("pt"),
  ...colunasBloco("bolso"),
  {
    id: "lider",
    rotulo: "Líder 1º → 2º",
    titulo: "Quem estava à frente no 1º turno e quem está no 2º turno",
    dir0: "asc",
    get: (l) => (l.virou ? 0 : 1),
    render: (l) => (
      <span className={cx("inline-flex items-center gap-1.5 text-xs", l.virou && "font-semibold")}>
        <Lider b={l.lider1} />
        <span className="text-muted">→</span>
        <Lider b={l.t2 ? l.lider2 : null} />
        {l.virou && (
          <span className="rounded bg-warn-bg px-1 text-[10px] font-semibold text-warn-fg" title="A liderança trocou de lado">
            virou
          </span>
        )}
      </span>
    ),
  },
];

function comparar(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

export default function TabelaTurnos({
  linhas,
  rotuloLugar,
  plural,
  rodape,
  carregando,
  titulo = "1º turno × 2º turno, lado a lado",
  pagina = 50,
}: {
  linhas: LinhaTurnos[];
  /** cabeçalho da 1ª coluna ("Estado", "Município", "País"...) */
  rotuloLugar: string;
  /** "estados", "municípios"... */
  plural: string;
  /** linha fixa de total (ex.: Brasil) */
  rodape?: LinhaTurnos | null;
  carregando?: boolean;
  titulo?: string;
  pagina?: number;
}) {
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "peso", dir: "desc" });
  const [limite, setLimite] = useState(pagina);
  const [filtro, setFiltro] = useState("");
  const filtroDef = useDeferredValue(filtro);

  const comT1 = useMemo(() => linhas.filter((l) => l.t1), [linhas]);
  const ordenadas = useMemo(() => {
    const q = normalizar(filtroDef);
    const base = q ? comT1.filter((l) => normalizar(l.nome).includes(q)) : comT1;
    const get =
      ordem.col === "nome"
        ? (l: LinhaTurnos) => l.nome
        : ordem.col === "peso"
          ? (l: LinhaTurnos) => l.peso
          : (COLUNAS.find((c) => c.id === ordem.col)?.get ?? ((l: LinhaTurnos) => l.nome));
    return base.slice().sort((a, b) => comparar(get(a), get(b), ordem.dir) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [comT1, filtroDef, ordem]);
  const visiveis = ordenadas.slice(0, limite);
  const completos = comT1.filter((l) => l.completo).length;
  const viradas = comT1.filter((l) => l.virou).length;

  function th(id: string, rotulo: ReactNode, titulo: string, dir0: "asc" | "desc" = "desc", extra?: string) {
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
  }

  const linhaTr = (l: LinhaTurnos, fixa?: boolean) => (
    <tr key={l.id} className={cx("hover:bg-surface-2", fixa && "border-t-2 border-line font-semibold", l.virou && "bg-warn-bg/30")}>
      <th scope="row" className="col-fixa max-w-[13rem] px-2 py-1.5 text-left font-medium">
        {l.href ? (
          <Link href={l.href} className="block truncate text-strong hover:underline">
            {l.nome}
            {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
          </Link>
        ) : (
          <span className="block truncate text-strong">
            {l.nome}
            {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
          </span>
        )}
      </th>
      {COLUNAS.map((c, i) => (
        <td
          key={c.id}
          className={cx(
            "whitespace-nowrap px-2 py-1.5 text-right",
            (c.id === "pt1" || c.id === "bolso1" || i === COLUNAS.length - 1) && "border-l border-line",
          )}
        >
          {c.render(l)}
        </td>
      ))}
    </tr>
  );

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle
        sub={`Votos de Lula e de Flávio em cada um dos ${plural} nos dois turnos de 2026. Δ votos e crescimento comparam cada candidato com os próprios votos do 1º turno e aparecem quando a apuração do 2º turno termina no lugar.`}
      >
        {titulo}
      </SectionTitle>
      {carregando && comT1.length === 0 ? (
        <SkeletonLinhas n={8} />
      ) : comT1.length === 0 ? (
        <p className="text-sm text-muted">Resultado do 1º turno indisponível no momento.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {comT1.length > 15 && (
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
            <span className="text-muted">
              {fmtInt(completos)} de {fmtInt(comT1.length)} {plural} com a apuração do 2º turno concluída
              {viradas > 0 && ` · liderança virou em ${fmtInt(viradas)}`}
            </span>
          </div>
          <div className="tabela-scroll rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[60rem] text-sm">
              <caption className="sr-only">
                {titulo}: votos de Lula e Flávio no 1º e no 2º turno por {rotuloLugar.toLowerCase()}. Clique no cabeçalho para ordenar.
              </caption>
              <thead className="bg-surface text-xs">
                <tr>
                  <td className="col-fixa" />
                  <th />
                  {(["pt", "bolso"] as const).map((b) => (
                    <th
                      key={b}
                      scope="colgroup"
                      colSpan={4}
                      className="border-b-2 border-l border-l-line px-2 pt-2 text-center text-xs font-semibold"
                      style={{ borderBottomColor: BLOCOS[b].cor, color: corTxt(b) }}
                    >
                      {BLOCOS[b].nomes["2026"]}
                    </th>
                  ))}
                  <th className="border-l border-line" />
                </tr>
                <tr className="border-b border-line">
                  {th("nome", rotuloLugar, `Nome do ${rotuloLugar.toLowerCase()}`, "asc", "col-fixa")}
                  {COLUNAS.map((c) => th(c.id, c.rotulo, c.titulo, c.dir0, c.grupo && c.id.endsWith("1") ? "border-l border-line" : undefined))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">{visiveis.map((l) => linhaTr(l))}</tbody>
              {rodape?.t1 && <tfoot>{linhaTr(rodape, true)}</tfoot>}
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
          <p className="text-xs text-muted">
            Ordem inicial: maior eleitorado primeiro. Clique nos cabeçalhos para ordenar (ex.: &quot;Cresc.&quot; mostra onde cada
            um mais ganhou ou perdeu votos). Linhas destacadas: a liderança trocou de lado.
          </p>
        </>
      )}
    </Card>
  );
}
