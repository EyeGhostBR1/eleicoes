"use client";
// Página de estado: resultado da UF + mapa e tabela de municípios.
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useParamsState } from "@/lib/client/hooks";
import { normalizar } from "@/lib/compare";
import { UF_POR_SIGLA } from "@/lib/config";
import { fmtInt } from "@/lib/format";
import AvisoParcial from "../AvisoParcial";
import ComparacaoBlocos from "../ComparacaoBlocos";
import ComparacaoParticipacao from "../ComparacaoParticipacao";
import BannerExterior from "../exterior/BannerExterior";
import MapaMetricas, { type DadosMapa } from "../MapaMetricas";
import ResumoLugares from "../ResumoLugares";
import StatusApuracao from "../StatusApuracao";
import TabelaCandidatos from "../TabelaCandidatos";
import TabelaComparativa, { type LinhaLugar } from "../TabelaComparativa";
import { candidatosPorNumero, dadosMapaDeLinha, linhaMunicipio } from "../linhas";
import { Card, ErroCarga, SectionTitle, Skeleton, SkeletonLinhas } from "../ui";
import { useHistBr, useHistMun, useIndiceMunicipios, useLiveOk, useMunicipiosOk } from "../useDados";

export default function EstadoView({ uf }: { uf: string }) {
  const info = UF_POR_SIGLA[uf];
  const exterior = uf === "zz";
  const { turno, qs } = useParamsState();
  const router = useRouter();

  const live = useLiveOk(uf);
  const histBr = useHistBr();
  const hist = histBr.data?.ufs?.[uf];
  const muns = useMunicipiosOk(uf);
  const histMun = useHistMun(uf);
  const idx = useIndiceMunicipios();

  const carregandoLive = !live.data && !live.error;
  const cands = useMemo(() => candidatosPorNumero(live.data), [live.data]);
  const tuplas = idx.porUf.get(uf);

  const linhas = useMemo<LinhaLugar[]>(
    () =>
      (tuplas ?? []).map((t) =>
        linhaMunicipio(t, muns.data?.municipios?.[t[0]], histMun.data?.[t[0]], turno, qs, cands),
      ),
    [tuplas, muns.data, histMun.data, turno, qs, cands],
  );
  const temLive = linhas.some((l) => l.pt.p2026 != null || l.bo.p2026 != null);

  // dados do mapa por código IBGE
  const dadosMapa = useMemo(() => {
    const m = new Map<string, DadosMapa>();
    if (!tuplas) return m;
    tuplas.forEach((t, i) => {
      if (t[3]) m.set(String(t[3]), dadosMapaDeLinha(linhas[i]));
    });
    return m;
  }, [tuplas, linhas]);

  const [filtro, setFiltro] = useState("");
  const filtroDef = useDeferredValue(filtro);
  const filtradas = useMemo(() => {
    const q = normalizar(filtroDef);
    return q ? linhas.filter((l) => normalizar(l.nome).includes(q)) : linhas;
  }, [linhas, filtroDef]);

  const rotuloMun = exterior ? "Cidade" : "Município";
  const pluralMun = exterior ? "cidades" : "municípios";
  const falhas = muns.data?.falhas?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Trilha" className="text-sm text-muted">
          <Link href={`/${qs}`} className="hover:text-fg hover:underline">
            Brasil
          </Link>{" "}
          <span aria-hidden>›</span> <span className="text-fg">{info.nome}</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-strong sm:text-3xl">
          {info.nome}
          {!exterior && <span className="ml-2 text-lg font-medium text-muted">{uf.toUpperCase()}</span>}
        </h1>
        <p className="mt-1 text-sm text-muted">Presidente · {turno}º turno · 2026 vs 2022 e 2018</p>
      </div>

      {exterior && <BannerExterior />}

      <div className="space-y-3">
        <StatusApuracao {...live} />
        <AvisoParcial pct={live.data?.totais.pctTotalizado} />
      </div>

      <ComparacaoBlocos live={live.data} hist={hist} turno={turno} carregando={carregandoLive} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TabelaCandidatos live={live.data} carregando={carregandoLive} />
        <ComparacaoParticipacao live={live.data} hist={hist} turno={turno} carregando={histBr.isLoading} />
      </div>

      <section aria-labelledby="sec-muns" className="space-y-4">
        <SectionTitle
          id="sec-muns"
          sub={
            tuplas
              ? `${fmtInt(tuplas.length)} ${pluralMun}${temLive ? " · 2026 ao vivo vs 2022 e 2018" : " · antes da apuração: resultados finais de 2022 e 2018"}`
              : undefined
          }
        >
          {exterior ? "Cidades no exterior" : "Municípios"}
        </SectionTitle>

        {muns.error && muns.error.status !== 404 && <ErroCarga msg={muns.error.message} onRetry={muns.mutate} />}
        {histMun.error && <ErroCarga msg={`Histórico dos ${pluralMun}: ${histMun.error.message}`} />}
        {idx.error && <ErroCarga msg={`Lista de ${pluralMun}: ${idx.error.message}`} />}
        {falhas > 0 && (
          <p className="text-xs text-muted">
            {fmtInt(falhas)} {pluralMun} ainda sem dados do TSE nesta atualização.
          </p>
        )}

        <div className={exterior ? "" : "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}>
          {!exterior && (
            <Card className="p-3 sm:p-4">
              {!tuplas ? (
                <Skeleton className="aspect-square w-full" />
              ) : (
                <MapaMetricas
                  src={`/geo/mun/${uf}.json`}
                  objectName="mun"
                  idProp="ibge"
                  ariaLabel={`Mapa dos municípios de ${info.nome}`}
                  temLive={temLive}
                  dados={dadosMapa}
                  onSelect={(ibge) => {
                    const cd = idx.ibgeParaCd.get(ibge);
                    if (cd) router.push(`/cidade/${uf}/${cd}${qs}`);
                  }}
                />
              )}
            </Card>
          )}
          <Card className="p-4">
            <h3 className="mb-3 text-base font-semibold text-strong">Resumo dos {pluralMun}</h3>
            {!tuplas ? <SkeletonLinhas n={3} /> : <ResumoLugares linhas={linhas} plural={pluralMun} minApurado={30} />}
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="filtro-mun" className="sr-only">
              Filtrar {pluralMun}
            </label>
            <input
              id="filtro-mun"
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder={`Filtrar ${pluralMun}…`}
              autoComplete="off"
              className="h-9 w-full max-w-xs rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted"
            />
            {filtroDef && (
              <span className="text-sm text-muted">
                {fmtInt(filtradas.length)} de {fmtInt(linhas.length)}
              </span>
            )}
          </div>
          {!tuplas ? (
            <SkeletonLinhas n={8} />
          ) : (
            <TabelaComparativa
              resetPagina={filtroDef}
              linhas={filtradas}
              modo={temLive ? "live" : "hist"}
              rotuloLugar={rotuloMun}
              pagina={50}
              ordemInicial={{ col: "peso", dir: "desc" }}
              caption={`Resultados por ${rotuloMun.toLowerCase()} — ${info.nome}`}
            />
          )}
          <p className="text-xs text-muted">Ordem inicial: maior eleitorado primeiro. Clique nos cabeçalhos para reordenar.</p>
        </div>
      </section>
    </div>
  );
}
