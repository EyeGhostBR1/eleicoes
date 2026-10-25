"use client";
// Aba "Crescimento": quanto cada lado ganhou de votos do 1º para o 2º turno em 2022 (Lula × Jair)
// e em 2026 (Lula × Flávio), lado a lado — no Brasil, por estado e por município de um estado.
//
// Crescimento = votos do candidato no 2º turno ÷ votos dele no 1º turno − 1 (o % dos válidos não
// serve: com dois candidatos no 2º turno ele sobe para ambos). 2026 só com o lugar 100% apurado.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { useEstadosTurno, useMunicipiosTurno } from "@/lib/client/hooks";
import { histDe, normalizar } from "@/lib/compare";
import { BLOCOS, UFS, UF_POR_SIGLA } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import { type LinhaTurnos, linhaTurnos, valTurnoDeHist, valTurnoDeLive, valTurnoDeMun } from "@/lib/turnos";
import type { BlocoId, HistByYear } from "@/lib/types";
import { Crescimento, DeltaVotos } from "../turnos/ComparacaoTurnos";
import { Card, Dot, ErroCarga, SectionTitle, SkeletonLinhas, corTextoBloco, cx } from "../ui";
import { useHistBr, useHistMun, useIndiceMunicipios } from "../useDados";

/** Um lugar com a comparação 1º → 2º turno nos dois anos. */
interface LinhaCresc {
  id: string;
  nome: string;
  sub?: string;
  href?: string;
  a22: LinhaTurnos;
  a26: LinhaTurnos;
  peso: number;
}

const NOMES: Record<BlocoId, { a22: string; a26: string; grupo: string }> = {
  pt: { a22: "Lula", a26: "Lula", grupo: "Lula (2022) × Lula (2026)" },
  bolso: { a22: "Jair", a26: "Flávio", grupo: "Jair (2022) × Flávio (2026)" },
};

function montar(
  base: { id: string; nome: string; sub?: string; href?: string },
  hist: HistByYear | null | undefined,
  t1: Parameters<typeof linhaTurnos>[1],
  t2: Parameters<typeof linhaTurnos>[2],
): LinhaCresc {
  const a22 = linhaTurnos(base, valTurnoDeHist(histDe(hist, "2022", 1)), valTurnoDeHist(histDe(hist, "2022", 2)));
  const a26 = linhaTurnos(base, t1, t2);
  return { ...base, a22, a26, peso: a26.peso || a22.peso };
}

const dl = (l: LinhaCresc, ano: "a22" | "a26", b: BlocoId) => (b === "pt" ? l[ano].pt : l[ano].bo);
/** diferença de crescimento (p.p.): crescimento 2026 − crescimento 2022 */
const dif = (l: LinhaCresc, b: BlocoId) => {
  const x = dl(l, "a26", b).cresc;
  const y = dl(l, "a22", b).cresc;
  return x != null && y != null ? x - y : null;
};

function DifPP({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted">—</span>;
  const r = Math.round(v * 10) / 10 || 0;
  return (
    <span className={cx("font-semibold", r > 0 ? "text-up" : r < 0 ? "text-down" : "text-muted")}>
      {r > 0 ? "+" : r < 0 ? "−" : "±"}
      {fmtPct(Math.abs(r), 1).replace("%", "")} p.p.
    </span>
  );
}

// ---------------------------------------------------------------------------
// Resumo do lugar
// ---------------------------------------------------------------------------
function LinhaAno({ rotulo, d, completo, pa }: { rotulo: string; d: LinhaTurnos["pt"]; completo: boolean; pa: number | null }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-baseline gap-2 py-2">
      <dt className="text-sm font-semibold text-fg">{rotulo}</dt>
      <dd className="text-sm tabular-nums">
        {fmtInt(d.v1)} <span className="text-muted">→</span> {d.v2 != null && pa != null ? fmtInt(d.v2) : "—"}
        <span className="block text-[11px] text-muted">votos no 1º → 2º turno</span>
      </dd>
      <dd className="text-right">
        {completo ? (
          <>
            <Crescimento v={d.cresc} className="text-lg" />
            <span className="block text-xs">
              <DeltaVotos v={d.dv} /> votos
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">{pa ? `apurando (${fmtPct(pa, 1)})` : "aguardando"}</span>
        )}
      </dd>
    </div>
  );
}

function Resumo({ l, nome }: { l: LinhaCresc | null; nome: string }) {
  if (!l) return <SkeletonLinhas n={4} />;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {(["pt", "bolso"] as const).map((b) => {
        const d = dif(l, b);
        return (
          <article key={b} className="relative overflow-hidden rounded-xl border border-line bg-surface p-4">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: BLOCOS[b].cor }} />
            <h3 className="flex items-center gap-2 text-base font-semibold" style={{ color: corTextoBloco(b) }}>
              <Dot cor={BLOCOS[b].cor} />
              {NOMES[b].grupo}
            </h3>
            <p className="text-xs text-muted">{nome} · crescimento dos votos do 1º para o 2º turno</p>
            <dl className="mt-2 divide-y divide-line border-y border-line">
              <LinhaAno rotulo={`2022 · ${NOMES[b].a22}`} d={dl(l, "a22", b)} completo={l.a22.completo} pa={100} />
              <LinhaAno rotulo={`2026 · ${NOMES[b].a26}`} d={dl(l, "a26", b)} completo={l.a26.completo} pa={l.a26.t2?.pa ?? null} />
            </dl>
            <p className="mt-2 text-sm">
              {d == null ? (
                <span className="text-muted">Comparação disponível com o 2º turno de 2026 100% apurado.</span>
              ) : (
                <>
                  {NOMES[b].a26} em 2026 cresceu{" "}
                  <strong>{Math.abs(d) < 0.05 ? "o mesmo" : d > 0 ? "mais" : "menos"}</strong> que {NOMES[b].a22} em 2022:{" "}
                  <DifPP v={d} />
                </>
              )}
            </p>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabela
// ---------------------------------------------------------------------------
type Valor = number | string | null;
interface Coluna {
  id: string;
  rotulo: ReactNode;
  titulo: string;
  grupo: BlocoId;
  get: (l: LinhaCresc) => Valor;
  render: (l: LinhaCresc) => ReactNode;
}

function celulaAno(l: LinhaCresc, ano: "a22" | "a26", b: BlocoId) {
  const d = dl(l, ano, b);
  if (!l[ano].t1) return <span className="text-muted">—</span>;
  if (!l[ano].completo) return <span className="text-xs text-muted">{l[ano].t2 ? "apurando" : "—"}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <Crescimento v={d.cresc} />
      <span className="text-[11px] text-muted tabular-nums">
        {fmtInt(d.v1)} → {fmtInt(d.v2)}
      </span>
    </span>
  );
}

const COLUNAS: Coluna[] = (["pt", "bolso"] as const).flatMap((b) => [
  {
    id: `${b}22`,
    grupo: b,
    rotulo: `2022 · ${NOMES[b].a22}`,
    titulo: `Crescimento dos votos de ${NOMES[b].a22} do 1º para o 2º turno de 2022`,
    get: (l: LinhaCresc) => dl(l, "a22", b).cresc,
    render: (l: LinhaCresc) => celulaAno(l, "a22", b),
  },
  {
    id: `${b}26`,
    grupo: b,
    rotulo: `2026 · ${NOMES[b].a26}`,
    titulo: `Crescimento dos votos de ${NOMES[b].a26} do 1º para o 2º turno de 2026`,
    get: (l: LinhaCresc) => dl(l, "a26", b).cresc,
    render: (l: LinhaCresc) => celulaAno(l, "a26", b),
  },
  {
    id: `${b}dif`,
    grupo: b,
    rotulo: "Diferença",
    titulo: `Crescimento de ${NOMES[b].a26} em 2026 − crescimento de ${NOMES[b].a22} em 2022 (p.p.)`,
    get: (l: LinhaCresc) => dif(l, b),
    render: (l: LinhaCresc) => <DifPP v={dif(l, b)} />,
  },
]);

function comparar(a: Valor, b: Valor, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "pt-BR");
  return dir === "asc" ? r : -r;
}

function Tabela({ linhas, rodape, rotuloLugar, plural }: { linhas: LinhaCresc[]; rodape: LinhaCresc | null; rotuloLugar: string; plural: string }) {
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "peso", dir: "desc" });
  const [filtro, setFiltro] = useState("");
  const [limite, setLimite] = useState(50);
  const filtroDef = useDeferredValue(filtro);
  const ordenadas = useMemo(() => {
    const q = normalizar(filtroDef);
    const base = q ? linhas.filter((l) => normalizar(l.nome).includes(q)) : linhas;
    const get =
      ordem.col === "nome"
        ? (l: LinhaCresc) => l.nome
        : ordem.col === "peso"
          ? (l: LinhaCresc) => l.peso
          : (COLUNAS.find((c) => c.id === ordem.col)?.get ?? ((l: LinhaCresc) => l.nome));
    return base.slice().sort((a, b) => comparar(get(a), get(b), ordem.dir) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [linhas, filtroDef, ordem]);
  const visiveis = ordenadas.slice(0, limite);
  const completos = linhas.filter((l) => l.a26.completo).length;

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

  const tr = (l: LinhaCresc, fixa?: boolean) => (
    <tr key={l.id} className={cx("hover:bg-surface-2", fixa && "border-t-2 border-line font-semibold")}>
      <th scope="row" className="col-fixa max-w-[13rem] px-2 py-1.5 text-left font-medium">
        {l.href ? (
          <Link href={l.href} className="block truncate text-strong hover:underline">
            {l.nome}
            {l.sub && <span className="ml-1 text-xs font-normal text-muted">{l.sub}</span>}
          </Link>
        ) : (
          <span className="block truncate text-strong">{l.nome}</span>
        )}
      </th>
      {COLUNAS.map((c) => (
        <td key={c.id} className={cx("whitespace-nowrap px-2 py-1.5 text-right", c.id.endsWith("22") && "border-l border-line")}>
          {c.render(l)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {linhas.length > 15 && (
          <input
            type="search"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setLimite(50);
            }}
            placeholder={`Filtrar ${plural}…`}
            aria-label={`Filtrar ${plural}`}
            autoComplete="off"
            className="h-9 w-full max-w-xs rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
          />
        )}
        <span className="text-muted">
          {fmtInt(completos)} de {fmtInt(linhas.length)} {plural} com o 2º turno de 2026 100% apurado
        </span>
      </div>
      <div className="tabela-scroll rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[52rem] text-sm">
          <caption className="sr-only">
            Crescimento dos votos do 1º para o 2º turno em 2022 e em 2026, por {rotuloLugar.toLowerCase()}. Clique no cabeçalho para ordenar.
          </caption>
          <thead className="bg-surface text-xs">
            <tr>
              <td className="col-fixa" />
              {(["pt", "bolso"] as const).map((b) => (
                <th
                  key={b}
                  scope="colgroup"
                  colSpan={3}
                  className="border-b-2 border-l border-l-line px-2 pt-2 text-center text-xs font-semibold"
                  style={{ borderBottomColor: BLOCOS[b].cor, color: corTextoBloco(b) }}
                >
                  {NOMES[b].grupo}
                </th>
              ))}
            </tr>
            <tr className="border-b border-line">
              {th("nome", rotuloLugar, `Nome do ${rotuloLugar.toLowerCase()}`, "asc", "col-fixa")}
              {COLUNAS.map((c) => th(c.id, c.rotulo, c.titulo, "desc", c.id.endsWith("22") ? "border-l border-line" : undefined))}
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
            onClick={() => setLimite((n) => n + 50)}
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

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CrescimentoView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ufParam = (sp.get("uf") ?? "").toLowerCase();
  const uf = UF_POR_SIGLA[ufParam] && ufParam !== "zz" ? ufParam : null;

  const histBr = useHistBr();
  const e1 = useEstadosTurno(1);
  const e2 = useEstadosTurno(2);
  const histMun = useHistMun(uf);
  const m1 = useMunicipiosTurno(uf, 1);
  const m2 = useMunicipiosTurno(uf, 2);
  const idx = useIndiceMunicipios();

  const brasil = useMemo(
    () =>
      histBr.data && e1.data
        ? montar({ id: "br", nome: "Brasil" }, histBr.data.br, valTurnoDeLive(e1.data.br), valTurnoDeLive(e2.data?.br))
        : null,
    [histBr.data, e1.data, e2.data],
  );
  const estados = useMemo(
    () =>
      histBr.data && e1.data
        ? UFS.map((u) =>
            montar(
              {
                id: u.sigla,
                nome: u.nome,
                sub: u.sigla === "zz" ? undefined : u.sigla.toUpperCase(),
                href: u.sigla === "zz" ? undefined : `${pathname}?uf=${u.sigla}`,
              },
              histBr.data!.ufs[u.sigla],
              valTurnoDeLive(e1.data!.ufs[u.sigla]),
              valTurnoDeLive(e2.data?.ufs[u.sigla]),
            ),
          )
        : [],
    [histBr.data, e1.data, e2.data, pathname],
  );
  const municipios = useMemo(
    () =>
      uf && histMun.data && m1.data
        ? (idx.porUf.get(uf) ?? []).map((t) =>
            montar(
              { id: t[0], nome: t[1], href: `/cidade/${uf}/${t[0]}` },
              histMun.data![t[0]],
              valTurnoDeMun(m1.data!.municipios[t[0]]),
              valTurnoDeMun(m2.data?.municipios[t[0]]),
            ),
          )
        : [],
    [uf, histMun.data, m1.data, m2.data, idx.porUf],
  );
  const linhaUf = uf ? (estados.find((l) => l.id === uf) ?? null) : null;

  const escolherUf = (v: string) => router.replace(v ? `${pathname}?uf=${v}` : pathname, { scroll: false });
  const erro = histBr.error ?? e1.error ?? (uf ? (histMun.error ?? m1.error) : undefined);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Eleição presidencial · 2022 × 2026</p>
        <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Crescimento do 1º para o 2º turno</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Quanto cada lado ganhou de votos do 1º para o 2º turno em 2022 (Lula × Jair) e em 2026 (Lula × Flávio). O
          crescimento compara os votos de cada candidato no 2º turno com os votos dele mesmo no 1º turno.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cresc-uf" className="text-sm text-muted">
          Local:
        </label>
        <select
          id="cresc-uf"
          value={uf ?? ""}
          onChange={(e) => escolherUf(e.target.value)}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm font-medium"
        >
          <option value="">Brasil (por estado)</option>
          {UFS.filter((u) => u.sigla !== "zz").map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.nome} (por município)
            </option>
          ))}
        </select>
        {uf && (
          <button type="button" onClick={() => escolherUf("")} className="text-sm text-muted underline underline-offset-2 hover:text-fg">
            Voltar ao Brasil
          </button>
        )}
      </div>

      {erro && <ErroCarga msg={erro.message} />}

      <Card className="p-4 sm:p-5">
        <SectionTitle sub="Votos no 1º turno → votos no 2º turno e crescimento, em 2022 e em 2026">
          {uf ? UF_POR_SIGLA[uf].nome : "Brasil"}
        </SectionTitle>
        <Resumo l={uf ? linhaUf : brasil} nome={uf ? UF_POR_SIGLA[uf].nome : "Brasil"} />
      </Card>

      <Card className="space-y-3 p-4">
        <SectionTitle
          sub={
            uf
              ? "Cada linha: crescimento dos votos do 1º para o 2º turno em 2022 e em 2026, e a diferença entre os dois."
              : "Clique num estado para ver os municípios. Cada linha: crescimento em 2022, em 2026 e a diferença."
          }
        >
          {uf ? `Municípios de ${UF_POR_SIGLA[uf].nome}` : "Por estado"}
        </SectionTitle>
        {(uf ? municipios.length === 0 : estados.length === 0) ? (
          <SkeletonLinhas n={10} />
        ) : uf ? (
          <Tabela key={uf} linhas={municipios} rodape={linhaUf} rotuloLugar="Município" plural="municípios" />
        ) : (
          <Tabela linhas={estados} rodape={brasil} rotuloLugar="Estado" plural="estados" />
        )}
        <p className="text-xs text-muted">
          &quot;Diferença&quot; = crescimento em 2026 menos crescimento em 2022, em pontos percentuais. Ex.: Flávio +14% em 2026 e
          Jair +9% em 2022 → +5 p.p. Os números de 2026 aparecem quando o lugar tem 100% apurado no 2º turno.
        </p>
      </Card>
    </div>
  );
}
