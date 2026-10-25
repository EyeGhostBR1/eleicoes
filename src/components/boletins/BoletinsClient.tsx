"use client";
// Página /boletins (parte interativa): busca, filtros, lista de boletins (cada um já comparado automaticamente
// com 2022, 2018 e os números oficiais de agora), resumo do exterior e comparador manual.
// Usa useSearchParams (via useParamsState) → precisa estar dentro de <Suspense> (ver app/boletins/page.tsx).
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBoletins, useParamsState } from "@/lib/client/hooks";
import type { Boletim, BoletinsResponse, FonteId, TipoBoletim, Turno } from "@/lib/types";
import BoletimCard from "./BoletimCard";
import ComparadorManual from "./ComparadorManual";
import { ListaCarregando } from "./Esqueletos";
import ResumoExterior from "./ResumoExterior";
import {
  type FiltroLocal,
  FONTES_INFO,
  TIPOS,
  TIPOS_PADRAO,
  cx,
  ehExterior,
  horaSeg,
  infoFonte,
  lerFontesParam,
  lerLocalParam,
  lerTiposParam,
  ordenarPorData,
  temNumeros,
  temVencedor,
  useAgora,
  useAtrasado,
} from "./util";

/** "Exterior" liga o filtro de local; as demais preenchem a busca. */
const SUGESTOES = ["Exterior", "Japão", "Portugal", "Estados Unidos", "São Paulo", "Minas Gerais", "Bahia", "Campinas"];
const LOCAIS: { id: FiltroLocal; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "brasil", rotulo: "Brasil" },
  { id: "exterior", rotulo: "Exterior" },
];
const PAGINA = 30;
const TIPOS_VAZIO: Record<TipoBoletim, number> = { apuracao: 0, "boca-de-urna": 0, pesquisa: 0, outro: 0 };

function ehPadrao(tipos: TipoBoletim[]) {
  return tipos.length === TIPOS_PADRAO.length && TIPOS_PADRAO.every((t) => tipos.includes(t));
}

function casaLocal(b: Boletim, local: FiltroLocal): boolean {
  if (local === "todos") return true;
  const ext = ehExterior(b.extraido?.escopo);
  return local === "exterior" ? ext : !ext;
}

function ChipFiltro({
  ativo,
  onClick,
  children,
  title,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      title={title}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500",
        ativo
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500",
      )}
    >
      {children}
    </button>
  );
}

function Contador({ n, ativo }: { n: number; ativo: boolean }) {
  return (
    <span
      className={cx(
        "rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
        ativo ? "bg-white/20 dark:bg-zinc-900/15" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      )}
    >
      {n}
    </span>
  );
}

function StatusFontes({ fontes }: { fontes: BoletinsResponse["fontes"] }) {
  if (!fontes?.length) return null;
  const ok = fontes.filter((f) => f.ok).length;
  const falhas = fontes.filter((f) => !f.ok);
  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded hover:text-zinc-800 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        <span className={cx("h-1.5 w-1.5 rounded-full", falhas.length ? "bg-orange-500" : "bg-emerald-500")} aria-hidden />
        {ok}/{fontes.length} fontes ok
        {falhas.length > 0 && (
          <span className="text-orange-700 dark:text-orange-400">
            · falha: {falhas.map((f) => infoFonte(f.id).curto || f.nome).join(", ")}
          </span>
        )}
        <span aria-hidden className="text-[9px] transition-transform group-open:rotate-180">
          ▼
        </span>
      </summary>
      <ul className="absolute left-0 z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        {fontes.map((f) => (
          <li key={f.id} className="flex items-baseline gap-2 py-0.5">
            <span
              aria-hidden
              className={cx("h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full", f.ok ? "bg-emerald-500" : "bg-orange-500")}
            />
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{f.nome}</span>
            <span className="ml-auto shrink-0 text-zinc-500 tabular-nums dark:text-zinc-400">
              {f.ok ? `${f.itens} ${f.itens === 1 ? "item" : "itens"}` : "falhou"}
            </span>
            {!f.ok && f.erro && <span className="sr-only">: {f.erro}</span>}
          </li>
        ))}
        {falhas.some((f) => f.erro) && (
          <li className="mt-1 border-t border-zinc-100 pt-1 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {falhas
              .filter((f) => f.erro)
              .map((f) => `${f.nome}: ${f.erro}`)
              .join(" · ")}
          </li>
        )}
      </ul>
    </details>
  );
}

function IconeBusca() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" strokeLinecap="round" />
    </svg>
  );
}

export default function BoletinsClient() {
  const sp = useSearchParams();
  const { turno, set } = useParamsState();
  const agora = useAgora();

  // Estado inicial vindo da URL (?q=&fontes=&tipos=&local=); depois a URL só espelha o estado.
  const [texto, setTexto] = useState(() => sp.get("q") ?? "");
  const [fontes, setFontes] = useState<FonteId[]>(() => lerFontesParam(sp.get("fontes")));
  const [tipos, setTipos] = useState<TipoBoletim[]>(() => lerTiposParam(sp.get("tipos")));
  const [local, setLocal] = useState<FiltroLocal>(() => lerLocalParam(sp.get("local")));
  const [soNumeros, setSoNumeros] = useState(false);
  const [limite, setLimite] = useState(PAGINA);

  const q = useAtrasado(texto.trim(), 450);
  const { data, error, isLoading, isValidating, mutate } = useBoletins(q, fontes);

  // Espelha busca/filtros na URL (sem navegação; integra com useSearchParams).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (q) p.set("q", q);
    else p.delete("q");
    if (fontes.length) p.set("fontes", fontes.join(","));
    else p.delete("fontes");
    if (ehPadrao(tipos)) p.delete("tipos");
    else p.set("tipos", tipos.length ? tipos.join(",") : "todos");
    if (local === "todos") p.delete("local");
    else p.set("local", local);
    p.delete("amb");
    const qs = p.toString();
    if (qs !== window.location.search.replace(/^\?/, "")) {
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, [q, fontes, tipos, local]);

  const itens = useMemo(() => ordenarPorData(data?.itens ?? []), [data]);
  // contagens por tipo e por local respeitam o outro filtro (o chip mostra quantos itens ele exibiria)
  const contagemTipos = useMemo(() => {
    const c = { ...TIPOS_VAZIO };
    for (const b of itens) if (casaLocal(b, local)) c[b.tipo] = (c[b.tipo] ?? 0) + 1;
    return c;
  }, [itens, local]);
  const contagemLocais = useMemo(() => {
    const c: Record<FiltroLocal, number> = { todos: 0, brasil: 0, exterior: 0 };
    for (const b of itens) {
      if (tipos.length && !tipos.includes(b.tipo)) continue;
      c.todos++;
      c[ehExterior(b.extraido?.escopo) ? "exterior" : "brasil"]++;
    }
    return c;
  }, [itens, tipos]);
  const nComNumeros = useMemo(() => itens.filter((b) => temNumeros(b.extraido)).length, [itens]);
  const nComVencedor = useMemo(() => itens.filter((b) => temVencedor(b.extraido)).length, [itens]);
  const filtrados = useMemo(
    () =>
      itens.filter(
        (b) =>
          (tipos.length === 0 || tipos.includes(b.tipo)) &&
          casaLocal(b, local) &&
          (!soNumeros || temNumeros(b.extraido) || temVencedor(b.extraido)),
      ),
    [itens, tipos, local, soNumeros],
  );
  const statusPorFonte = useMemo(() => new Map((data?.fontes ?? []).map((f) => [f.id, f])), [data]);

  function alternarFonte(id: FonteId) {
    setFontes((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
    setLimite(PAGINA);
  }
  function alternarTipo(id: TipoBoletim) {
    setTipos((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
    setLimite(PAGINA);
  }
  function mudarLocal(l: FiltroLocal) {
    setLocal(l);
    setLimite(PAGINA);
  }
  function mostrarTudo() {
    setTipos([]);
    setLocal("todos");
    setSoNumeros(false);
    setLimite(PAGINA);
  }

  const buscando = isValidating || texto.trim() !== q;
  const semNumerosAinda = !!data && nComNumeros === 0 && nComVencedor === 0;
  // Sem itens nos filtros atuais → mostra as últimas notícias (todos os tipos e locais).
  const listaMostrada = filtrados.length ? filtrados : itens;
  const usandoFallback = !!data && filtrados.length === 0 && itens.length > 0;
  const visiveis = listaMostrada.slice(0, limite);

  return (
    <>
      {/* Barra de contexto: turno / atalho para o comparador */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <div
          role="group"
          aria-label="Turno da comparação"
          className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {([1, 2] as Turno[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={turno === t}
              onClick={() => set({ turno: t })}
              className={cx(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                turno === t
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
            >
              {t}º turno
            </button>
          ))}
        </div>
        <span className="text-zinc-500 dark:text-zinc-400">
          cada boletim já vem comparado com o {turno}º turno de 2022 e de 2018 e com os números oficiais de agora
        </span>
        <a
          href="#comparador-manual"
          className="ml-auto rounded-md border border-zinc-200 px-2 py-1 font-medium text-zinc-700 hover:border-zinc-400 lg:hidden dark:border-zinc-700 dark:text-zinc-300"
        >
          Comparador manual ↓
        </a>
      </div>

      <ResumoExterior
        filtroAtivo={local === "exterior"}
        onFiltrar={() => mudarLocal(local === "exterior" ? "todos" : "exterior")}
        nBoletins={data ? contagemLocais.exterior : null}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {/* Busca */}
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="busca-boletins" className="sr-only">
              Buscar boletins por local, veículo ou termo
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
                <IconeBusca />
              </span>
              <input
                id="busca-boletins"
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setLimite(PAGINA);
                }}
                placeholder="Buscar: Japão, Bahia, Campinas, boletim CNN…"
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-10 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {buscando && (
                <span
                  aria-hidden
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300"
                />
              )}
            </div>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Sugestões:</span>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (s === "Exterior") {
                    mudarLocal("exterior");
                    return;
                  }
                  setTexto(s);
                  setLimite(PAGINA);
                }}
                className={cx(
                  "font-medium underline underline-offset-2",
                  s === "Exterior"
                    ? "text-sky-800 decoration-sky-300 hover:decoration-sky-700 dark:text-sky-300 dark:decoration-sky-700"
                    : "text-zinc-700 decoration-zinc-300 hover:decoration-zinc-600 dark:text-zinc-300 dark:decoration-zinc-600 dark:hover:decoration-zinc-300",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Filtros de fonte */}
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Fontes
            </p>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <ChipFiltro
                ativo={fontes.length === 0}
                onClick={() => {
                  setFontes([]);
                  setLimite(PAGINA);
                }}
              >
                Todas
              </ChipFiltro>
              {FONTES_INFO.map((f) => {
                const ativo = fontes.includes(f.id);
                const st = statusPorFonte.get(f.id);
                return (
                  <ChipFiltro
                    key={f.id}
                    ativo={ativo}
                    onClick={() => alternarFonte(f.id)}
                    title={
                      st ? (st.ok ? `${f.nome}: ${st.itens} itens` : `${f.nome}: falhou${st.erro ? ` (${st.erro})` : ""}`) : f.nome
                    }
                  >
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: f.cor }} />
                    {f.nome}
                    {st && !st.ok ? (
                      <span className="font-bold text-orange-600 dark:text-orange-400" aria-label="falhou">
                        !
                      </span>
                    ) : st ? (
                      <Contador n={st.itens} ativo={ativo} />
                    ) : null}
                  </ChipFiltro>
                );
              })}
            </div>
          </div>

          {/* Filtros de tipo e de local */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Tipo
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <ChipFiltro
                  ativo={tipos.length === 0}
                  onClick={() => {
                    setTipos([]);
                    setLimite(PAGINA);
                  }}
                >
                  Todos
                  {data && (
                    <Contador n={itens.filter((b) => casaLocal(b, local)).length} ativo={tipos.length === 0} />
                  )}
                </ChipFiltro>
                {TIPOS.map((t) => {
                  const ativo = tipos.includes(t.id);
                  return (
                    <ChipFiltro key={t.id} ativo={ativo} onClick={() => alternarTipo(t.id)}>
                      {t.rotulo}
                      {data && <Contador n={contagemTipos[t.id] ?? 0} ativo={ativo} />}
                    </ChipFiltro>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Local
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {LOCAIS.map((l) => (
                  <ChipFiltro
                    key={l.id}
                    ativo={local === l.id}
                    onClick={() => mudarLocal(l.id)}
                    title={l.id === "exterior" ? "Boletins sobre países e cidades do exterior (votos de brasileiros fora do país)" : undefined}
                  >
                    {l.id === "exterior" && <span aria-hidden>🌎</span>}
                    {l.rotulo}
                    {data && <Contador n={contagemLocais[l.id]} ativo={local === l.id} />}
                  </ChipFiltro>
                ))}
              </div>
            </div>
          </div>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={soNumeros}
              onChange={(e) => {
                setSoNumeros(e.target.checked);
                setLimite(PAGINA);
              }}
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-zinc-800 dark:accent-zinc-200"
            />
            Só com números ou vencedor
          </label>

          {/* Status de atualização */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 pb-3 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cx(
                  "h-1.5 w-1.5 rounded-full",
                  isValidating ? "animate-pulse bg-amber-500" : error ? "bg-orange-500" : "bg-emerald-500",
                )}
              />
              Atualiza a cada 60s
            </span>
            {data && <span className="tabular-nums">Atualizado às {horaSeg(data.geradoEm)}</span>}
            {error && data && <span className="text-orange-700 dark:text-orange-400">falha na última atualização</span>}
            <button
              type="button"
              onClick={() => void mutate()}
              disabled={isValidating}
              className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 disabled:cursor-wait disabled:opacity-50 dark:text-zinc-300 dark:decoration-zinc-600"
            >
              Atualizar agora
            </button>
            {data && <StatusFontes fontes={data.fontes} />}
          </div>

          {/* Lista */}
          <section aria-labelledby="titulo-lista-boletins" className="mt-4" aria-busy={isLoading}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h2 id="titulo-lista-boletins" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {usandoFallback
                  ? "Últimas notícias"
                  : q
                    ? `Resultados para “${q}”`
                    : local === "exterior"
                      ? "Boletins do exterior"
                      : "Últimos boletins"}
              </h2>
              {data && (
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {usandoFallback ? itens.length : filtrados.length} de {itens.length} itens · {nComNumeros} com números ·{" "}
                  {nComVencedor} com vencedor
                </span>
              )}
            </div>

            {!data && isLoading && <ListaCarregando />}

            {!data && error && (
              <div
                role="alert"
                className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm text-zinc-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-zinc-200"
              >
                <span className="font-medium">Não foi possível carregar os boletins.</span>{" "}
                <span className="text-zinc-600 dark:text-zinc-400">{error.message}</span>{" "}
                <button
                  type="button"
                  onClick={() => void mutate()}
                  className="font-medium underline underline-offset-2"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {semNumerosAinda && (
              <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Ainda não há boletins com números{q ? ` para “${q}”` : ""}.
                </p>
                <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                  Mesmo assim, cada notícia abaixo já vem com a comparação do lugar citado: números oficiais de agora
                  (boletins de urna no exterior; TSE no Brasil a partir das 17h, horário de Brasília) contra 2022 e 2018.
                </p>
              </div>
            )}

            {usandoFallback && (
              <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                Nenhum item com os filtros atuais — mostrando todas as notícias.{" "}
                <button
                  type="button"
                  onClick={mostrarTudo}
                  className="font-medium text-zinc-800 underline underline-offset-2 dark:text-zinc-200"
                >
                  Limpar filtros
                </button>
              </p>
            )}

            {data && itens.length === 0 && (
              <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                Nenhuma notícia encontrada{q ? ` para “${q}”` : ""}. Tente outro termo ou outras fontes.
              </p>
            )}

            {visiveis.length > 0 && (
              <ul className="space-y-2">
                {visiveis.map((b) => (
                  <li key={b.id}>
                    <BoletimCard b={b} agora={agora} />
                  </li>
                ))}
              </ul>
            )}

            {listaMostrada.length > limite && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + PAGINA)}
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-white py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Mostrar mais ({listaMostrada.length - limite})
              </button>
            )}

            {data && (
              <p className="mt-4 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                Números, local e vencedor extraídos automaticamente dos textos publicados pelos veículos — podem conter
                erros de leitura. Confira sempre no link original. Boletins do exterior podem vir de qualquer jornal; os
                números oficiais de agora vêm dos boletins de urna publicados pelo TSE (exterior) e da totalização do TSE
                (Brasil). Resultados de 2022 e 2018: TSE (finais).
              </p>
            )}
          </section>
        </div>

        <aside id="comparador-manual" aria-label="Comparador manual" className="min-w-0 scroll-mt-4 lg:self-start">
          <ComparadorManual />
        </aside>
      </div>
    </>
  );
}
