"use client";
// Página inicial: Brasil + mapa e tabela por estado.
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useEstadosTurno, useExteriorTurno, useParamsState } from "@/lib/client/hooks";
import { linhaTurnos, valTurnoDeLive } from "@/lib/turnos";
import { UFS } from "@/lib/config";
import AvisoParcial from "../AvisoParcial";
import ComparacaoBlocos from "../ComparacaoBlocos";
import ComparacaoParticipacao from "../ComparacaoParticipacao";
import MapaMetricas from "../MapaMetricas";
import ResumoLugares from "../ResumoLugares";
import StatusApuracao from "../StatusApuracao";
import TabelaCandidatos from "../TabelaCandidatos";
import TabelaComparativa from "../TabelaComparativa";
import ComparacaoTurnos from "../turnos/ComparacaoTurnos";
import TabelaTurnos from "../turnos/TabelaTurnos";
import { turnosExterior } from "../turnos/exterior";
import CardExteriorHome from "../exterior/CardExteriorHome";
import TeaserEstimativa from "../estimativa/TeaserEstimativa";
import { valoresTurnos } from "../metricas";
import { dadosMapaDeLinha, linhaBrasil, linhaEstado, linhaExteriorBU } from "../linhas";
import { Card, ErroCarga, SectionTitle, Skeleton } from "../ui";
import { useEstadosOk, useExteriorOk, useHistBr, useHistMun, useLiveOk } from "../useDados";

export default function BrasilView() {
  const { turno, qs } = useParamsState();
  const router = useRouter();
  const live = useLiveOk("br");
  const estados = useEstadosOk();
  const histBr = useHistBr();
  const hist = histBr.data;
  const ext = useExteriorOk();
  const histZz = useHistMun("zz");

  const carregandoLive = !live.data && !live.error;

  const linhasTse = useMemo(
    () => UFS.map((u) => linhaEstado(u, estados.data?.ufs?.[u.sigla], hist?.ufs?.[u.sigla], turno, qs)),
    [estados.data, hist, turno, qs],
  );
  // "ao vivo" só quando o TSE já totaliza (os boletins do exterior chegam antes das 17h)
  const temLive = linhasTse.some((l) => l.pt.p2026 != null || l.bo.p2026 != null);
  // linha Exterior: sem totalização do TSE ainda, usa os boletins de urna já recebidos
  const linhas = useMemo(
    () =>
      linhasTse.map((l) =>
        l.id === "zz" ? linhaExteriorBU(l, estados.data?.ufs?.zz, ext.data, histZz.data, turno, qs, temLive) : l,
      ),
    [linhasTse, estados.data, ext.data, histZz.data, turno, qs, temLive],
  );
  // 2º turno: comparação com o 1º turno de 2026 (resultado final, sem polling)
  const segundo = turno === 2;
  const t1 = useEstadosTurno(segundo ? 1 : null);
  const t1ok = segundo ? t1.data : undefined;
  const turnosBr = useMemo(
    () =>
      t1ok ? linhaTurnos({ id: "br", nome: "Brasil" }, valTurnoDeLive(t1ok.br), valTurnoDeLive(live.data ?? estados.data?.br)) : null,
    [t1ok, live.data, estados.data],
  );
  // exterior: boletins de urna dos dois turnos (mesmas cidades), não a totalização
  const ext1 = useExteriorTurno(segundo ? 1 : null);
  const teTotal = useMemo(
    () => (segundo ? turnosExterior(ext1.data, ext.data, qs).total : null),
    [segundo, ext1.data, ext.data, qs],
  );
  const turnosUfs = useMemo(
    () =>
      t1ok
        ? UFS.map((u) =>
            u.sigla === "zz" && teTotal
              ? { ...teTotal, href: `/exterior${qs}` }
              : linhaTurnos(
              { id: u.sigla, nome: u.nome, sub: u.sigla === "zz" ? undefined : u.sigla.toUpperCase(), href: `/estado/${u.sigla}${qs}` },
              valTurnoDeLive(t1ok.ufs?.[u.sigla]),
              valTurnoDeLive(estados.data?.ufs?.[u.sigla]),
            ),
          )
        : [],
    [t1ok, estados.data, qs, teTotal],
  );
  const temTurnos = segundo && !!t1ok;

  const dadosMapa = useMemo(() => {
    const t1Por = new Map(turnosUfs.map((l) => [l.id, l]));
    return new Map(
      linhas
        .filter((l) => l.id !== "zz")
        .map((l) => {
          const d = dadosMapaDeLinha(l);
          const t = t1Por.get(l.id);
          return [l.id, t ? { ...d, ...valoresTurnos(t) } : d];
        }),
    );
  }, [linhas, turnosUfs]);
  const rodape = linhaBrasil(live.data ?? estados.data?.br, hist?.br, turno, qs);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Eleição presidencial 2026 · {turno}º turno</p>
        <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Brasil</h1>
        <p className="mt-1 text-sm text-muted">Lula × Flávio Bolsonaro em tempo real, comparados com 2022 e 2018.</p>
      </div>

      <div className="space-y-3">
        <StatusApuracao {...live} />
        <AvisoParcial pct={live.data?.totais.pctTotalizado} />
        <TeaserEstimativa />
      </div>

      <ComparacaoBlocos live={live.data} hist={hist?.br} turno={turno} carregando={carregandoLive} />

      {segundo && (
        <ComparacaoTurnos linha={turnosBr} carregando={t1.isLoading} nomeLugar="Brasil" />
      )}
      {segundo && t1.error && <ErroCarga msg={`1º turno de 2026: ${t1.error.message}`} onRetry={() => void t1.mutate()} />}

      <CardExteriorHome />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TabelaCandidatos live={live.data} carregando={carregandoLive} />
        <ComparacaoParticipacao live={live.data} hist={hist?.br} turno={turno} carregando={histBr.isLoading} />
      </div>

      {histBr.error && <ErroCarga msg={`Histórico 2022/2018: ${histBr.error.message}`} />}

      <section aria-labelledby="sec-mapa-uf">
        <SectionTitle
          id="sec-mapa-uf"
          sub="Clique em um estado para ver os municípios"
          right={
            <Link href={`/mapa${qs}`} className="text-sm font-medium text-strong underline underline-offset-2">
              Mapa interativo de todos os municípios →
            </Link>
          }
        >
          Mapa por estado
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Card className="p-3 sm:p-4">
            {histBr.isLoading && !hist ? (
              <Skeleton className="aspect-square w-full" />
            ) : (
              <MapaMetricas
                src="/geo/uf.json"
                objectName="uf"
                idProp="uf"
                ariaLabel="Mapa do Brasil por estado"
                temLive={temLive}
                temTurnos={temTurnos}
                dados={dadosMapa}
                onSelect={(id) => router.push(`/estado/${id}${qs}`)}
              />
            )}
          </Card>
          <Card className="p-4">
            <h3 className="mb-3 text-base font-semibold text-strong">Resumo por estado</h3>
            {estados.error && estados.error.status !== 404 && (
              <div className="mb-3">
                <ErroCarga msg={estados.error.message} onRetry={estados.mutate} />
              </div>
            )}
            <ResumoLugares linhas={linhas.filter((l) => l.id !== "zz")} plural="estados" />
          </Card>
        </div>
      </section>

      {segundo && (
        <TabelaTurnos
          linhas={turnosUfs}
          rotuloLugar="Estado"
          plural="estados"
          rodape={turnosBr}
          carregando={t1.isLoading || estados.isLoading}
          pagina={30}
        />
      )}

      <section aria-labelledby="sec-tabela-uf">
        <SectionTitle
          id="sec-tabela-uf"
          sub={temLive ? "Percentual dos válidos em 2026 e variação em p.p. vs 2022 e 2018" : "Antes da apuração: resultados finais de 2022 e 2018"}
        >
          Estados
        </SectionTitle>
        <TabelaComparativa
          linhas={linhas}
          modo={temLive ? "live" : "hist"}
          rotuloLugar="Estado"
          mostrarLider
          rodape={rodape}
          caption="Resultados por estado"
        />
      </section>
    </div>
  );
}
