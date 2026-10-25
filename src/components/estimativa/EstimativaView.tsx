"use client";
// Página /estimativa: "Estimativa do resultado final" com base no parcial apurado,
// em comparação histórica com 2022 e 2018.
//
// Em `next dev`, `?demo=<% apurado>` (ex.: /estimativa?demo=35) mostra dados FICTÍCIOS gerados
// por ./fixture para conferir o layout antes da apuração. Desativado em produção.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useHistBr, useParamsState } from "@/lib/client/hooks";
import { histDe, histPctBloco } from "@/lib/compare";
import { fmtDataHora, fmtPct } from "@/lib/format";
import type { Turno } from "@/lib/types";
import { Card, ErroCarga, SectionTitle, Skeleton } from "../ui";
import ComoFunciona from "./ComoFunciona";
import ComparacaoHistorica, { type ParBlocos } from "./ComparacaoHistorica";
import { gerarFixtureEstimativa, gerarSerieDemo } from "./fixture";
import GraficoEvolucao from "./GraficoEvolucao";
import HeroEstimativa from "./HeroEstimativa";
import { adicionarPonto, limparHistorico, pontoDe, useHistoricoEvolucao } from "./historico";
import MapaEstimativa from "./MapaEstimativa";
import TabelaCenarios from "./TabelaCenarios";
import TabelaEstadosEstimativa from "./TabelaEstadosEstimativa";
import { useEstimativa } from "./useEstimativa";

const DEV = process.env.NODE_ENV !== "production";

function EstadoVazioEstimativa({ turno, motivo, qs }: { turno: Turno; motivo?: string; qs: string }) {
  return (
    <Card className="p-5 sm:p-6" role="status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-base font-semibold text-strong">
            {turno === 2
              ? "A estimativa do 2º turno aparece assim que o TSE começar a divulgar a apuração do 2º turno."
              : "A estimativa aparece assim que o TSE começar a divulgar a apuração, a partir das 17h (Brasília)."}
          </p>
          <p className="mt-1 text-sm text-muted">
            Esta página se atualiza sozinha. Enquanto isso, veja abaixo os resultados finais de 2022 e 2018 e como a
            estimativa é calculada.
          </p>
          {motivo && !/17h/.test(motivo) && <p className="mt-1 text-xs text-muted">{motivo}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={`/${qs}`}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-strong hover:bg-surface"
          >
            Apuração ao vivo →
          </Link>
          {turno === 1 && (
            <Link
              href={`/exterior${qs}`}
              className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-strong hover:bg-surface"
            >
              Votos do exterior →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando estimativa">
      <Card className="p-5">
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border border-line p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-12 w-40" />
              <Skeleton className="mt-3 h-4 w-48" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-4 h-16 w-full" />
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function EstimativaView() {
  const { turno, qs } = useParamsState();
  const sp = useSearchParams();
  const demoBruto = DEV ? sp.get("demo") : null;
  const demoPct =
    demoBruto != null && demoBruto.trim() !== "" && Number.isFinite(Number(demoBruto))
      ? Math.min(100, Math.max(0, Number(demoBruto)))
      : null;
  const emDemo = demoPct != null;

  const est = useEstimativa();
  const histBr = useHistBr();
  const hist = histBr.data;

  const demo = useMemo(
    () => (demoPct != null && hist ? gerarFixtureEstimativa(hist, demoPct, turno) : undefined),
    [demoPct, hist, turno],
  );
  const serieDemo = useMemo(
    () => (demoPct != null && hist ? gerarSerieDemo(hist, demoPct, turno) : null),
    [demoPct, hist, turno],
  );
  const data = emDemo ? demo : est.data;

  // "Evolução da noite": acumula um ponto por totalização (só dados reais)
  const historico = useHistoricoEvolucao(turno);
  useEffect(() => {
    if (!emDemo && est.data) adicionarPonto(turno, pontoDe(est.data));
  }, [emDemo, est.data, turno]);
  const limpar = useCallback(() => limparHistorico(turno), [turno]);

  const erro = !emDemo && !data && est.error && est.error.status !== 404 ? est.error : null;
  const carregando = emDemo ? !demo && !histBr.error : !data && !est.error;
  const disponivel = !!data?.disponivel && !!data.br;
  const indisponivel = !carregando && !erro && !disponivel;

  // finais históricos (da resposta; antes da apuração, do arquivo estático)
  const final = (ano: "2022" | "2018"): ParBlocos => {
    const daApi = ano === "2022" ? data?.br?.final2022 : data?.br?.final2018;
    const h = histDe(hist?.br, ano, turno);
    return {
      pt: daApi?.pt ?? histPctBloco(h, "pt"),
      bolso: daApi?.bolso ?? histPctBloco(h, "bolso"),
    };
  };
  const f22 = final("2022");
  const f18 = final("2018");
  const br = disponivel ? data!.br! : null;

  return (
    <div className="space-y-6">
      {emDemo && (
        <p role="note" className="rounded-lg border border-transparent bg-warn-bg px-3 py-2 text-sm font-medium text-warn-fg">
          ⚠ MODO DEMONSTRAÇÃO (só em desenvolvimento): números FICTÍCIOS gerados a partir de 2022 com{" "}
          {fmtPct(demoPct, 1)} apurado. Remova <code>?demo</code> da URL para ver os dados reais.
        </p>
      )}

      <div>
        <p className="text-sm font-medium text-muted">Eleição presidencial 2026 · {turno}º turno</p>
        <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Estimativa do resultado final</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Projeção do resultado final a partir da apuração parcial do TSE, corrigida pela ordem de chegada das urnas e
          comparada com 2022 e 2018. Estimativa independente — não é resultado oficial.
        </p>
        {data && disponivel && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-live="off">
            <span>
              Última totalização usada: <span className="font-medium text-fg">{fmtDataHora(data.atualizadoEm)}</span>
            </span>
            {!emDemo && (
              <>
                {est.error && <span className="text-down">Falha na última atualização</span>}
                <span>{est.isValidating ? "Atualizando…" : "Atualiza a cada 30 s"}</span>
                <button
                  type="button"
                  onClick={est.mutate}
                  disabled={est.isValidating}
                  className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
                >
                  Atualizar
                </button>
              </>
            )}
          </p>
        )}
      </div>

      {carregando && <Esqueleto />}
      {erro && <ErroCarga msg={erro.message} onRetry={est.mutate} />}
      {indisponivel && <EstadoVazioEstimativa turno={turno} motivo={data?.motivo} qs={qs} />}

      {br && data && (
        <>
          <HeroEstimativa r={data} turno={turno} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ComparacaoHistorica
              est={{ pt: br.cenarios.base2022.pt.pct, bolso: br.cenarios.base2022.bolso.pct }}
              f22={f22}
              f18={f18}
              turno={turno}
            />
            <TabelaCenarios br={br} turno={turno} />
          </div>

          <section aria-labelledby="sec-evolucao">
            <SectionTitle
              id="sec-evolucao"
              sub="Estimativa final × parcial apurado conforme a apuração avança: o parcial tende a convergir para a estimativa."
            >
              Evolução da noite
            </SectionTitle>
            <Card className="p-3 sm:p-4">
              <GraficoEvolucao
                pontos={serieDemo ?? historico}
                turno={turno}
                onLimpar={limpar}
                demo={!!serieDemo}
              />
            </Card>
          </section>

          <section aria-labelledby="sec-mapa-est">
            <SectionTitle id="sec-mapa-est" sub="Cor = vantagem estimada no fim da apuração (cenário base 2022)">
              Mapa da estimativa
            </SectionTitle>
            <MapaEstimativa ufs={data.ufs} qs={qs} />
          </section>

          <section aria-labelledby="sec-estados-est">
            <SectionTitle
              id="sec-estados-est"
              sub="Parcial e estimativa final (% dos válidos), variação vs resultados finais de 2022 e 2018 e o swing aplicado às seções restantes"
            >
              Estimativa por estado
            </SectionTitle>
            <TabelaEstadosEstimativa ufs={data.ufs} br={br} qs={qs} />
          </section>
        </>
      )}

      {!br && !carregando && (
        <ComparacaoHistorica est={null} f22={f22} f18={f18} turno={turno} />
      )}
      {histBr.error && !br && <ErroCarga msg={`Histórico 2022/2018: ${histBr.error.message}`} onRetry={() => void histBr.mutate()} />}

      <ComoFunciona margemHistorica={data?.margemHistorica} pctApurado={br?.pctTotalizado ?? null} turno={turno} />
    </div>
  );
}
