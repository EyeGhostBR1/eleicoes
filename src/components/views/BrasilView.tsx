"use client";
// Página inicial: Brasil + mapa e tabela por estado.
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useParamsState } from "@/lib/client/hooks";
import { UFS } from "@/lib/config";
import AvisoParcial from "../AvisoParcial";
import ComparacaoBlocos from "../ComparacaoBlocos";
import ComparacaoParticipacao from "../ComparacaoParticipacao";
import MapaMetricas from "../MapaMetricas";
import ResumoLugares from "../ResumoLugares";
import StatusApuracao from "../StatusApuracao";
import TabelaCandidatos from "../TabelaCandidatos";
import TabelaComparativa from "../TabelaComparativa";
import CardExteriorHome from "../exterior/CardExteriorHome";
import TeaserEstimativa from "../estimativa/TeaserEstimativa";
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
  const dadosMapa = useMemo(
    () => new Map(linhas.filter((l) => l.id !== "zz").map((l) => [l.id, dadosMapaDeLinha(l)])),
    [linhas],
  );
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

      <CardExteriorHome />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TabelaCandidatos live={live.data} carregando={carregandoLive} />
        <ComparacaoParticipacao live={live.data} hist={hist?.br} turno={turno} carregando={histBr.isLoading} />
      </div>

      {histBr.error && <ErroCarga msg={`Histórico 2022/2018: ${histBr.error.message}`} />}

      <section aria-labelledby="sec-mapa-uf">
        <SectionTitle id="sec-mapa-uf" sub="Clique em um estado para ver os municípios">
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
