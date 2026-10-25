"use client";
// Tabela ordenável por estado (inclui Exterior): parcial × estimativa final (base 2022),
// Δ vs finais de 2022/2018 e o swing usado nas seções restantes, com a origem do swing.
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { BLOCOS, UFS } from "@/lib/config";
import { fmtPP, fmtPct } from "@/lib/format";
import type { BlocoId, EstimativaLugar } from "@/lib/types";
import { Badge, DeltaPP, cx } from "../ui";
import { FONTE_SWING, dif, nomeLugar } from "./util";

interface Linha {
  id: string;
  nome: string;
  sub?: string;
  href: string;
  pa: number | null;
  pPt: number | null;
  pBo: number | null;
  ePt: number | null;
  eBo: number | null;
  d22Pt: number | null;
  d18Pt: number | null;
  d22Bo: number | null;
  d18Bo: number | null;
  swPt: number | null;
  swBo: number | null;
  fonte: EstimativaLugar["fonteSwing"] | null;
  validos: number | null;
}

function linhaDe(id: string, l: EstimativaLugar | null | undefined, href: string): Linha {
  const e = l?.cenarios.base2022;
  const ePt = e?.pt.pct ?? null;
  const eBo = e?.bolso.pct ?? null;
  return {
    id,
    nome: nomeLugar(id),
    sub: id === "br" || id === "zz" ? undefined : id.toUpperCase(),
    href,
    pa: l?.pctTotalizado ?? null,
    pPt: l?.parcial.pt ?? null,
    pBo: l?.parcial.bolso ?? null,
    ePt,
    eBo,
    d22Pt: dif(ePt, l?.final2022.pt),
    d18Pt: dif(ePt, l?.final2018.pt),
    d22Bo: dif(eBo, l?.final2022.bolso),
    d18Bo: dif(eBo, l?.final2018.bolso),
    swPt: l?.swing.base2022.pt ?? null,
    swBo: l?.swing.base2022.bolso ?? null,
    fonte: l?.fonteSwing ?? null,
    validos: e?.validos ?? null,
  };
}

type Valor = number | string | null;

interface Coluna {
  id: string;
  rotulo: ReactNode;
  titulo?: string;
  grupo?: BlocoId | "swing";
  get: (l: Linha) => Valor;
  render: (l: Linha) => ReactNode;
}

const corTxt = (b: BlocoId) => (b === "pt" ? "var(--c-pt)" : "var(--c-bolso)");

const ORDEM_FONTE: Record<string, number> = { proprio: 0, regiao: 1, nacional: 2, nenhum: 3 };

function SwingCell({ l }: { l: Linha }) {
  if (l.swPt == null && l.swBo == null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight" title="Swing vs 2022 aplicado às seções restantes">
      <span style={{ color: corTxt("pt") }}>L {fmtPP(l.swPt).replace(" p.p.", "")}</span>
      <span style={{ color: corTxt("bolso") }}>F {fmtPP(l.swBo).replace(" p.p.", "")}</span>
    </span>
  );
}

const COLUNAS: Coluna[] = [
  { id: "pa", rotulo: "% apurado", get: (l) => l.pa, render: (l) => <span className="text-muted">{fmtPct(l.pa, 1)}</span> },
  { id: "pPt", grupo: "pt", rotulo: "Parcial", get: (l) => l.pPt, render: (l) => <span className="text-fg">{fmtPct(l.pPt, 1)}</span> },
  {
    id: "ePt",
    grupo: "pt",
    rotulo: "Estim.",
    titulo: "Estimativa final (base 2022)",
    get: (l) => l.ePt,
    render: (l) => (
      <span className="font-semibold" style={{ color: l.ePt != null ? corTxt("pt") : undefined }}>
        {fmtPct(l.ePt, 1)}
      </span>
    ),
  },
  { id: "d22Pt", grupo: "pt", rotulo: "Δ 22", titulo: "Estimativa − Lula 2022 (final)", get: (l) => l.d22Pt, render: (l) => <DeltaPP v={l.d22Pt} semSufixo /> },
  { id: "d18Pt", grupo: "pt", rotulo: "Δ 18", titulo: "Estimativa − Haddad 2018 (final)", get: (l) => l.d18Pt, render: (l) => <DeltaPP v={l.d18Pt} semSufixo /> },
  { id: "pBo", grupo: "bolso", rotulo: "Parcial", get: (l) => l.pBo, render: (l) => <span className="text-fg">{fmtPct(l.pBo, 1)}</span> },
  {
    id: "eBo",
    grupo: "bolso",
    rotulo: "Estim.",
    titulo: "Estimativa final (base 2022)",
    get: (l) => l.eBo,
    render: (l) => (
      <span className="font-semibold" style={{ color: l.eBo != null ? corTxt("bolso") : undefined }}>
        {fmtPct(l.eBo, 1)}
      </span>
    ),
  },
  { id: "d22Bo", grupo: "bolso", rotulo: "Δ 22", titulo: "Estimativa − Jair 2022 (final)", get: (l) => l.d22Bo, render: (l) => <DeltaPP v={l.d22Bo} semSufixo /> },
  { id: "d18Bo", grupo: "bolso", rotulo: "Δ 18", titulo: "Estimativa − Jair 2018 (final)", get: (l) => l.d18Bo, render: (l) => <DeltaPP v={l.d18Bo} semSufixo /> },
  {
    id: "sw",
    grupo: "swing",
    rotulo: "vs 2022",
    titulo: "Swing (p.p.) de Lula (L) e Flávio (F) em relação a 2022 usado nas seções restantes",
    get: (l) => l.swPt,
    render: (l) => <SwingCell l={l} />,
  },
  {
    id: "fonte",
    grupo: "swing",
    rotulo: "Origem",
    titulo: "De onde veio o swing: o próprio estado, a média da região ou a média nacional",
    get: (l) => (l.fonte ? ORDEM_FONTE[l.fonte] : null),
    render: (l) => {
      if (!l.fonte) return <span className="text-muted">—</span>;
      const f = FONTE_SWING[l.fonte];
      return (
        <span title={f.titulo}>
          <Badge tom={f.tom}>{f.rotulo}</Badge>
          <span className="sr-only"> — {f.titulo}</span>
        </span>
      );
    },
  },
];

const GRUPOS: Record<string, { rotulo: string; cor?: string }> = {
  pt: { rotulo: "Lula", cor: BLOCOS.pt.cor },
  bolso: { rotulo: "Flávio", cor: BLOCOS.bolso.cor },
  swing: { rotulo: "Swing usado" },
};

function comparar(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

export default function TabelaEstadosEstimativa({
  ufs,
  br,
  qs,
}: {
  ufs: Record<string, EstimativaLugar>;
  br: EstimativaLugar | null;
  qs: string;
}) {
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "validos", dir: "desc" });

  const linhas = useMemo(
    () => UFS.map((u) => linhaDe(u.sigla, ufs[u.sigla], `/estado/${u.sigla}${qs}`)),
    [ufs, qs],
  );
  const rodape = useMemo(() => (br ? linhaDe("br", br, `/${qs}`) : null), [br, qs]);

  const ordenadas = useMemo(() => {
    const get: (l: Linha) => Valor =
      ordem.col === "nome"
        ? (l) => l.nome
        : ordem.col === "validos"
          ? (l) => l.validos
          : (COLUNAS.find((c) => c.id === ordem.col)?.get ?? ((l) => l.nome));
    return linhas.slice().sort((a, b) => comparar(get(a), get(b), ordem.dir) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas, ordem]);

  function clicar(id: string, dir0: "asc" | "desc" = "desc") {
    setOrdem((o) => (o.col === id ? { col: id, dir: o.dir === "asc" ? "desc" : "asc" } : { col: id, dir: dir0 }));
  }

  function th(id: string, rotulo: ReactNode, titulo?: string, extra?: string, dir0?: "asc" | "desc") {
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

  const grupos: { id: string; span: number }[] = [];
  for (const c of COLUNAS) {
    const g = c.grupo ?? "";
    const ult = grupos[grupos.length - 1];
    if (ult && ult.id === g) ult.span++;
    else grupos.push({ id: g, span: 1 });
  }

  const tr = (l: Linha, fixa?: boolean) => (
    <tr key={l.id} className={cx("group hover:bg-surface-2", fixa && "border-t-2 border-line font-semibold")}>
      <th scope="row" className="col-fixa max-w-[12rem] px-2 py-1.5 text-left font-medium group-hover:bg-surface-2">
        <Link href={l.href} className="block truncate text-strong hover:underline">
          {l.nome}
          {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
        </Link>
      </th>
      {COLUNAS.map((c) => (
        <td key={c.id} className="whitespace-nowrap px-2 py-1.5 text-right">
          {c.render(l)}
        </td>
      ))}
    </tr>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Ordenar por:</span>
        <button
          type="button"
          onClick={() => setOrdem({ col: "validos", dir: "desc" })}
          aria-pressed={ordem.col === "validos"}
          className={cx(
            "rounded-full border px-2 py-0.5 font-medium",
            ordem.col === "validos" ? "border-strong bg-strong text-surface" : "border-line bg-surface text-fg hover:bg-surface-2",
          )}
        >
          Tamanho (votos)
        </button>
        <button
          type="button"
          onClick={() => setOrdem({ col: "nome", dir: "asc" })}
          aria-pressed={ordem.col === "nome"}
          className={cx(
            "rounded-full border px-2 py-0.5 font-medium",
            ordem.col === "nome" ? "border-strong bg-strong text-surface" : "border-line bg-surface text-fg hover:bg-surface-2",
          )}
        >
          Nome
        </button>
        <span className="hidden sm:inline">· ou clique no cabeçalho de uma coluna</span>
      </div>
      <div className="tabela-scroll rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">
            Estimativa do resultado final por estado: % apurado, parcial e estimativa de Lula e Flávio, variação em p.p.
            vs resultados finais de 2022 e 2018, e swing usado. Clique no cabeçalho de uma coluna para ordenar.
          </caption>
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
                    style={{
                      borderColor: GRUPOS[g.id]?.cor ?? "var(--line)",
                      color: g.id === "pt" || g.id === "bolso" ? corTxt(g.id) : undefined,
                    }}
                  >
                    {GRUPOS[g.id]?.rotulo ?? g.id}
                  </th>
                ) : (
                  <th key={`v-${i}`} colSpan={g.span} />
                ),
              )}
            </tr>
            <tr className="border-b border-line">
              {th("nome", "Estado", undefined, "col-fixa", "asc")}
              {COLUNAS.map((c) => th(c.id, c.rotulo, c.titulo))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{ordenadas.map((l) => tr(l))}</tbody>
          {rodape && <tfoot>{tr(rodape, true)}</tfoot>}
        </table>
      </div>
    </div>
  );
}
