"use client";
// Página /mapa: todos os municípios do Brasil num mapa com zoom, coloridos pela métrica escolhida
// (margem 2026, variação 1º → 2º turno, vs 2022/2018), com painel do município selecionado.
//
// Os dados chegam por UF (27 × /api/tse/municipios e 27 × /data/hist/mun/{uf}.json) com
// concorrência baixa, para não disparar dezenas de funções (e milhares de downloads no TSE) de
// uma vez. A UF em foco (selecionada/buscada) entra na frente da fila.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, useParamsState } from "@/lib/client/hooks";
import { compararMun } from "@/lib/compare";
import { BLOCOS, TURNOS_FINALIZADOS, UFS, UF_POR_SIGLA } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import type { HistMunFile, LiveMunRow, MunicipioTuple, MunicipiosResponse, Turno } from "@/lib/types";
import BuscaMunicipio from "../BuscaMunicipio";
import { Legend } from "../map/Legend";
import { SeletorMetrica, TooltipMapa, useMetrica, type DadosMapa } from "../MapaMetricas";
import { METRICA_POR_ID, corMetrica, legendaMetrica, valoresDeLinhas, valoresTurnos, valorMetrica } from "../metricas";
import { linhaTurnos, valTurnoDeMun } from "@/lib/turnos";
import { Card, DeltaPP, SectionTitle, corTextoBloco } from "../ui";
import { useIndiceMunicipios } from "../useDados";
import { Crescimento, DeltaVotos } from "../turnos/ComparacaoTurnos";
import ZoomMap, { type ZoomMapControle } from "./ZoomMap";

const UFS_MAPA = UFS.filter((u) => u.sigla !== "zz").map((u) => u.sigla);
/** Ordem de carga dos dados (maiores eleitorados primeiro). */
const ORDEM = ["sp", "mg", "rj", "ba", "pr", "rs", "pe", "ce", "pa", "sc", "go", "ma", "am", "es", "pb", "rn", "mt", "al", "pi", "df", "ms", "se", "ro", "to", "ac", "ap", "rr"];

// ---------------------------------------------------------------------------
// Carga por UF com fila priorizada, concorrência limitada e atualização periódica
// ---------------------------------------------------------------------------
function useCargasUF<T>(
  chave: string | null,
  url: (uf: string) => string,
  opts: { concorrencia: number; refreshMs: number; prioridade: string | null },
): { dados: Record<string, T>; prontas: number } {
  const [estado, setEstado] = useState<{ chave: string | null; dados: Record<string, T> }>({ chave: null, dados: {} });
  const prioridadeRef = useRef(opts.prioridade);
  const urlRef = useRef(url);
  useEffect(() => {
    prioridadeRef.current = opts.prioridade;
    urlRef.current = url;
  });

  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const rodada = async () => {
      const fila = ORDEM.filter((u) => UFS_MAPA.includes(u));
      let falhou = false;
      const proxima = () => {
        const p = prioridadeRef.current;
        const i = p ? fila.indexOf(p) : -1;
        return fila.length ? fila.splice(i >= 0 ? i : 0, 1)[0] : null;
      };
      const worker = async () => {
        for (let uf = proxima(); uf && vivo; uf = proxima()) {
          try {
            const j = await fetchJson<T>(urlRef.current(uf));
            if (!vivo) return;
            setEstado((e) => ({ chave, dados: { ...(e.chave === chave ? e.dados : {}), [uf]: j } }));
          } catch {
            falhou = true; // mantém o dado anterior da UF; tenta de novo na próxima rodada
          }
        }
      };
      await Promise.all(Array.from({ length: opts.concorrencia }, worker));
      if (!vivo) return;
      const espera = opts.refreshMs > 0 ? opts.refreshMs : falhou ? 30_000 : 0;
      if (espera > 0) timer = setTimeout(rodada, espera);
    };
    void rodada();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [chave, opts.concorrencia, opts.refreshMs]);

  const dados = estado.chave === chave ? estado.dados : {};
  return { dados, prontas: Object.keys(dados).length };
}

// ---------------------------------------------------------------------------
// Painel do município selecionado
// ---------------------------------------------------------------------------
function LinhaPainel({
  rotulo,
  pt,
  bo,
  nomes,
  votos,
  destaque,
}: {
  rotulo: string;
  pt: number | null;
  bo: number | null;
  nomes?: [string, string];
  votos?: [number, number] | null;
  destaque?: boolean;
}) {
  return (
    <tr className={destaque ? "font-semibold" : undefined}>
      <th scope="row" className="py-1.5 pr-2 text-left font-medium text-muted">
        {rotulo}
        {nomes && <span className="block text-[11px] font-normal">{nomes.join(" × ")}</span>}
      </th>
      <td className="px-1 py-1.5 text-right" style={{ color: corTextoBloco("pt") }}>
        {fmtPct(pt, 1)}
        {votos && <span className="block text-[11px] font-normal text-muted">{fmtInt(votos[0])}</span>}
      </td>
      <td className="px-1 py-1.5 text-right" style={{ color: corTextoBloco("bolso") }}>
        {fmtPct(bo, 1)}
        {votos && <span className="block text-[11px] font-normal text-muted">{fmtInt(votos[1])}</span>}
      </td>
    </tr>
  );
}

function Painel({
  t,
  row,
  rowT1,
  hist,
  turno,
  qs,
  onFechar,
}: {
  t: MunicipioTuple;
  row: LiveMunRow | undefined;
  rowT1: LiveMunRow | undefined;
  hist: HistMunFile[string] | undefined;
  turno: Turno;
  qs: string;
  onFechar: () => void;
}) {
  const [cd, nome, uf] = t;
  const pt = compararMun("pt", row, hist, turno);
  const bo = compararMun("bolso", row, hist, turno);
  const temLive = row != null && row.vv > 0;
  // 1º × 2º turno: votos, num bloco separado das outras eleições
  const lt = turno === 2 && rowT1 ? linhaTurnos({ id: cd, nome }, valTurnoDeMun(rowT1), valTurnoDeMun(row)) : null;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold leading-tight text-strong">{nome}</h3>
          <p className="text-sm text-muted">
            {UF_POR_SIGLA[uf]?.nome} ({uf.toUpperCase()})
            {row && ` · ${fmtPct(row.pa, 1)} apurado no ${turno}º turno`}
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-md px-2 py-0.5 text-lg leading-none text-muted hover:bg-surface-2 hover:text-fg"
        >
          ×
        </button>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Resultados em {nome}</caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="py-1 text-left font-medium">
              Eleição
            </th>
            <th scope="col" className="px-1 py-1 text-right font-medium" style={{ color: corTextoBloco("pt") }}>
              PT
            </th>
            <th scope="col" className="px-1 py-1 text-right font-medium" style={{ color: corTextoBloco("bolso") }}>
              Bolsonaro
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <LinhaPainel
            rotulo={`2026 · ${turno}º turno${temLive ? "" : " (sem dados)"}`}
            pt={pt.p2026}
            bo={bo.p2026}
            nomes={["Lula", "Flávio"]}
            votos={temLive ? [row!.pt, row!.bo] : null}
            destaque
          />
          <LinhaPainel rotulo={`2022 · ${turno}º turno`} pt={pt.p2022} bo={bo.p2022} nomes={["Lula", "Jair"]} />
          <LinhaPainel rotulo={`2018 · ${turno}º turno`} pt={pt.p2018} bo={bo.p2018} nomes={["Haddad", "Jair"]} />
        </tbody>
      </table>
      {temLive && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">Lula vs 2022</dt>
          <dd className="text-right">
            <DeltaPP v={pt.d22} />
          </dd>
          <dt className="text-muted">Flávio vs Jair 2022</dt>
          <dd className="text-right">
            <DeltaPP v={bo.d22} />
          </dd>
        </dl>
      )}
      {lt?.t1 && (
        <div className="rounded-lg border border-line p-2.5">
          <p className="mb-1 text-xs font-semibold text-strong">1º turno × 2º turno (votos)</p>
          {(["pt", "bolso"] as const).map((b) => {
            const d = b === "pt" ? lt.pt : lt.bo;
            return (
              <p key={b} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium" style={{ color: corTextoBloco(b) }}>
                  {b === "pt" ? "Lula" : "Flávio"}
                </span>
                <span className="tabular-nums">
                  {fmtInt(d.v1)} → {lt.t2 ? fmtInt(d.v2) : "—"}{" "}
                  {lt.completo ? (
                    <>
                      <DeltaVotos v={d.dv} className="text-xs" /> <Crescimento v={d.cresc} className="text-xs" />
                    </>
                  ) : (
                    <span className="text-xs text-muted">(apurando)</span>
                  )}
                </span>
              </p>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/cidade/${uf}/${cd}${qs}`} className="font-medium text-strong underline underline-offset-2">
          Página do município
        </Link>
        <Link href={`/estado/${uf}${qs}`} className="text-muted underline underline-offset-2 hover:text-fg">
          Ver {UF_POR_SIGLA[uf]?.nome}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function MapaInterativo() {
  const { turno, qs } = useParamsState();
  const idx = useIndiceMunicipios();
  const ctrl = useRef<ZoomMapControle>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [focoUf, setFocoUf] = useState<string | null>(null);
  const [geoProg, setGeoProg] = useState<[number, number]>([0, UFS_MAPA.length]);
  const pendente = useRef<string | null>(null);

  const finalizado = TURNOS_FINALIZADOS.includes(turno);
  const live = useCargasUF<MunicipiosResponse>(
    `live:${turno}`,
    (uf) => `/api/tse/municipios?uf=${uf}&turno=${turno}&amb=oficial`,
    { concorrencia: 3, refreshMs: finalizado ? 0 : 120_000, prioridade: focoUf },
  );
  const t1 = useCargasUF<MunicipiosResponse>(
    turno === 2 ? "t1" : null,
    (uf) => `/api/tse/municipios?uf=${uf}&turno=1&amb=oficial`,
    { concorrencia: 2, refreshMs: 0, prioridade: focoUf },
  );
  const hist = useCargasUF<HistMunFile>("hist", (uf) => `/data/hist/mun/${uf}.json`, {
    concorrencia: 4,
    refreshMs: 0,
    prioridade: focoUf,
  });

  const ibgeParaTupla = useMemo(() => {
    const m = new Map<string, MunicipioTuple>();
    for (const [uf, l] of idx.porUf) if (uf !== "zz") for (const t of l) if (t[3]) m.set(String(t[3]), t);
    return m;
  }, [idx.porUf]);

  const dados = useMemo(() => {
    const m = new Map<string, DadosMapa>();
    for (const [ibge, t] of ibgeParaTupla) {
      const [cd, nome, uf] = t;
      const respLive = live.dados[uf];
      const row = respLive && respLive.turno === turno ? respLive.municipios[cd] : undefined;
      const h = hist.dados[uf]?.[cd];
      const v = valoresDeLinhas(compararMun("pt", row, h, turno), compararMun("bolso", row, h, turno));
      const d: DadosMapa = { nome: `${nome} (${uf.toUpperCase()})`, pa: row ? row.pa : null, ...v };
      if (turno === 2) {
        const r1 = t1.dados[uf]?.municipios[cd];
        if (r1) Object.assign(d, valoresTurnos(linhaTurnos({ id: cd, nome }, valTurnoDeMun(r1), valTurnoDeMun(row))));
      }
      m.set(ibge, d);
    }
    return m;
  }, [ibgeParaTupla, live.dados, hist.dados, t1.dados, turno]);

  const temLive = useMemo(() => {
    for (const d of dados.values()) if (d.pt26 != null || d.bo26 != null) return true;
    return false;
  }, [dados]);
  const temTurnos = turno === 2 && t1.prontas > 0;
  const { metrica, setEscolha, disponivel } = useMetrica(temLive, temTurnos);

  const getFill = useCallback((id: string) => corMetrica(metrica, dados.get(id)), [metrica, dados]);
  const getTooltip = useCallback((id: string) => <TooltipMapa d={dados.get(id)} metrica={metrica} />, [dados, metrica]);
  const legenda = useMemo(() => legendaMetrica(metrica), [metrica]);

  // resumo: em quantos municípios cada um lidera / cresceu (só os já carregados)
  const resumo = useMemo(() => {
    let lula = 0;
    let flavio = 0;
    let sobe = 0;
    let desce = 0;
    let n = 0;
    for (const d of dados.values()) {
      const v = valorMetrica(metrica, d);
      if (v == null) continue;
      n++;
      if (v > 0) sobe++;
      else if (v < 0) desce++;
      if (d.pt26 != null && d.bo26 != null) {
        if (d.pt26 > d.bo26) lula++;
        else if (d.bo26 > d.pt26) flavio++;
      }
    }
    return { lula, flavio, sobe, desce, n };
  }, [dados, metrica]);

  const tSel = selecionado ? ibgeParaTupla.get(selecionado) : undefined;

  const focarMun = (t: MunicipioTuple) => {
    const ibge = String(t[3]);
    setSelecionado(ibge);
    setFocoUf(t[2]);
    pendente.current = ibge;
    ctrl.current?.focarMun(ibge);
  };

  // geometria do município buscado chegou depois da busca → foca quando a UF carregar
  const onProgresso = useCallback((p: number, total: number) => {
    setGeoProg([p, total]);
    if (pendente.current) ctrl.current?.focarMun(pendente.current);
  }, []);
  useEffect(() => {
    // depois do 1º foco bem-sucedido, para de tentar
    const id = setTimeout(() => {
      pendente.current = null;
    }, 8_000);
    return () => clearTimeout(id);
  }, [selecionado]);

  const m = METRICA_POR_ID[metrica];
  const carregandoDados = live.prontas < UFS_MAPA.length || hist.prontas < UFS_MAPA.length || (turno === 2 && t1.prontas < UFS_MAPA.length);
  const nomeLado = (pos: boolean) => {
    if (m.tipo === "margem") return pos ? "PT à frente" : "Bolsonaro à frente";
    return pos ? "positivo" : "negativo";
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted">Eleição presidencial 2026 · {turno}º turno</p>
        <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Mapa interativo dos municípios</h1>
        <p className="mt-1 text-sm text-muted">
          Use a roda do mouse, os botões + e − ou o gesto de pinça para dar zoom; arraste para mover. Toque ou clique num
          município para ver os números.
        </p>
      </div>

      <Card className="space-y-3 p-3 sm:p-4">
        <SeletorMetrica metrica={metrica} onChange={setEscolha} disponivel={disponivel} temTurnos={turno === 2} />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mapa-uf" className="sr-only">
            Ir para o estado
          </label>
          <select
            id="mapa-uf"
            value={focoUf ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setFocoUf(v || null);
              if (v) ctrl.current?.focarUf(v);
              else ctrl.current?.reset();
            }}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
          >
            <option value="">Brasil inteiro</option>
            {UFS.filter((u) => u.sigla !== "zz").map((u) => (
              <option key={u.sigla} value={u.sigla}>
                {u.nome}
              </option>
            ))}
          </select>
          <BuscaMunicipio className="w-full sm:w-72" onEscolher={focarMun} placeholder="Ir para o município…" />
          <span className="text-xs text-muted" aria-live="polite">
            {geoProg[0] < geoProg[1]
              ? `Carregando mapa: ${geoProg[0]}/${geoProg[1]} estados`
              : carregandoDados
                ? `Carregando resultados: ${Math.min(live.prontas, hist.prontas)}/${UFS_MAPA.length} estados`
                : "Todos os estados carregados"}
            {!finalizado && !carregandoDados && " · atualiza a cada 2 min"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ZoomMap
            ref={ctrl}
            getFill={getFill}
            getTooltip={getTooltip}
            onSelect={(id) => {
              setSelecionado(id);
              pendente.current = null;
              const t = id ? ibgeParaTupla.get(id) : undefined;
              if (t) setFocoUf(t[2]);
            }}
            selectedId={selecionado}
            prioridadeUf={focoUf}
            onProgresso={onProgresso}
            ariaLabel={`Mapa dos municípios do Brasil — ${m.rotulo}`}
          />
          <div className="space-y-4">
            <div className="rounded-lg border border-line p-3">
              {tSel ? (
                <Painel
                  t={tSel}
                  row={live.dados[tSel[2]]?.municipios[tSel[0]]}
                  rowT1={t1.dados[tSel[2]]?.municipios[tSel[0]]}
                  hist={hist.dados[tSel[2]]?.[tSel[0]]}
                  turno={turno}
                  qs={qs}
                  onFechar={() => setSelecionado(null)}
                />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-strong">Nenhum município selecionado</p>
                  <p className="text-muted">
                    Clique num município no mapa ou use a busca acima. Passe o mouse para uma prévia.
                  </p>
                  {temLive && (
                    <p>
                      Em {fmtInt(resumo.lula + resumo.flavio)} municípios com votos no {turno}º turno:{" "}
                      <span className="font-semibold" style={{ color: corTextoBloco("pt") }}>
                        {BLOCOS.pt.nomes["2026"]} lidera em {fmtInt(resumo.lula)}
                      </span>
                      ,{" "}
                      <span className="font-semibold" style={{ color: corTextoBloco("bolso") }}>
                        Flávio em {fmtInt(resumo.flavio)}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Legend data={legenda} />
              <p className="text-xs text-muted">{m.explicacao}</p>
              {m.tipo === "swing" && resumo.n > 0 && (
                <p className="text-xs">
                  Valor {nomeLado(true)} em <strong>{fmtInt(resumo.sobe)}</strong> e {nomeLado(false)} em{" "}
                  <strong>{fmtInt(resumo.desce)}</strong> de {fmtInt(resumo.n)} municípios.
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <SectionTitle>Como ler</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Vermelho é sempre o lado de Lula (PT) e azul o de Flávio (e de Jair em 2022/2018), em todas as camadas.</li>
          <li>
            No 2º turno, as camadas &quot;2º − 1º turno&quot; mostram onde cada candidato cresceu ou caiu em relação ao 1º
            turno de 2026; &quot;Quem herdou mais&quot; mostra quem ganhou mais terreno entre os turnos.
          </li>
          <li>Municípios em cinza ainda não têm dados (apuração não começou ou resultado ainda carregando).</li>
          <li>Com a apuração em andamento, os percentuais de cada município podem mudar até 100% das urnas apuradas.</li>
        </ul>
      </section>
    </div>
  );
}
