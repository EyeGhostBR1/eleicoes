"use client";
// Página /exterior: boletins de urna (BU) das seções no exterior já recebidos pelo TSE,
// agregados por país e cidade, comparados com 2022 e 2018 nas mesmas cidades.
import Link from "next/link";
import { useMemo } from "react";
import { BLOCOS } from "@/lib/config";
import { histDe, histPctBloco } from "@/lib/compare";
import { useExteriorTurno, useParamsState } from "@/lib/client/hooks";
import { fmtInt, fmtPct } from "@/lib/format";
import type { ExtAgregado, HistByYear, Turno } from "@/lib/types";
import { Card, SectionTitle, SkeletonLinhas } from "../ui";
import { useExteriorOk, useHistMun, useListaMunicipios } from "../useDados";
import CandidatosExterior from "./CandidatosExterior";
import ComparacaoJusta from "./ComparacaoJusta";
import { histExteriorInteiro } from "./dados";
import { CargaExterior, Placar, StatusExterior } from "./partes";
import TabelaPaises from "./TabelaPaises";
import ComparacaoTurnos from "../turnos/ComparacaoTurnos";
import TabelaTurnos from "../turnos/TabelaTurnos";
import { turnosExterior } from "../turnos/exterior";

function ReferenciaInteiro({ hist, turno }: { hist: HistByYear; turno: Turno }) {
  const anos = (["2022", "2018"] as const).map((ano) => {
    const h = histDe(hist, ano, turno);
    return { ano, pt: histPctBloco(h, "pt"), bo: histPctBloco(h, "bolso") };
  });
  if (anos.every((a) => a.pt == null)) return null;
  return (
    <p className="text-xs text-muted">
      Exterior inteiro (resultado final):{" "}
      {anos.map((a, i) => (
        <span key={a.ano}>
          {i > 0 && " · "}
          {a.ano} {BLOCOS.pt.nomes[a.ano]}{" "}
          <span className="font-medium" style={{ color: "var(--c-pt)" }}>
            {fmtPct(a.pt, 1)}
          </span>{" "}
          × Jair{" "}
          <span className="font-medium" style={{ color: "var(--c-bolso)" }}>
            {fmtPct(a.bo, 1)}
          </span>
        </span>
      ))}
    </p>
  );
}

function CartaoTotal({ total, histInteiro, turno }: { total: ExtAgregado; histInteiro: HistByYear; turno: Turno }) {
  const completo = total.secoesTotal > 0 && total.secoesRecebidas >= total.secoesTotal;
  return (
    <Card className="p-4 sm:p-5" aria-labelledby="ext-total">
      <SectionTitle id="ext-total" sub="Soma de todas as seções com boletim recebido">
        Total no exterior
      </SectionTitle>
      {total.validos > 0 ? (
        <Placar ag={total} />
      ) : (
        <p className="text-sm text-muted">Ainda sem votos válidos nos boletins recebidos.</p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Comparecimento</dt>
          <dd className="font-semibold text-fg">
            {fmtInt(total.comparecimento)}{" "}
            <span className="text-xs font-normal text-muted">
              ({fmtPct(total.aptos > 0 ? (total.comparecimento / total.aptos) * 100 : null, 1)} de {fmtInt(total.aptos)} aptos)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Votos válidos</dt>
          <dd className="font-semibold text-fg">{fmtInt(total.validos)}</dd>
        </div>
      </dl>
      {!completo && (
        <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          <span aria-hidden>ⓘ </span>
          <span className="font-medium text-fg">Total parcial e enviesado pela geografia.</span> Os boletins chegam conforme
          as seções encerram a votação no horário local: primeiro Ásia e Oceania, depois Oriente Médio, Europa e África e,
          por último, as Américas (onde estão os EUA, maior colégio eleitoral no exterior). Para comparar com 2022 e 2018,
          use a comparação nas mesmas cidades.
        </p>
      )}
      <div className="mt-3">
        <ReferenciaInteiro hist={histInteiro} turno={turno} />
      </div>
    </Card>
  );
}

export default function ExteriorView() {
  const { turno, qs } = useParamsState();
  const ext = useExteriorOk();
  const histZz = useHistMun("zz");
  // nomes das cidades enquanto a API não respondeu (lista estática, já em cache do cabeçalho)
  const lista = useListaMunicipios();
  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of lista.data ?? []) if (t[2] === "zz") m.set(t[0], t[1]);
    return m;
  }, [lista.data]);
  const nomeCidade = useMemo(() => (cd: string) => nomes.get(cd), [nomes]);
  const histInteiro = useMemo(() => histExteriorInteiro(histZz.data), [histZz.data]);
  const data = ext.data;

  // 2º turno: comparação com o 1º turno (boletins de urna dos dois turnos, mesmas cidades)
  const segundo = turno === 2;
  const ext1 = useExteriorTurno(segundo ? 1 : null);
  const te = useMemo(() => turnosExterior(segundo ? ext1.data : undefined, data, qs), [segundo, ext1.data, data, qs]);

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Trilha" className="text-sm text-muted">
          <Link href={`/${qs}`} className="hover:text-fg hover:underline">
            Brasil
          </Link>{" "}
          <span aria-hidden>›</span> <span className="text-fg">Exterior por país</span>
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-strong sm:text-3xl">Exterior — votos por país</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Boletins de urna oficiais (TSE) das seções no exterior já encerradas — publicados antes da totalização das 17h.
          Comparação com 2022 (Lula × Jair) e 2018 (Haddad × Jair) nos mesmos países. {turno}º turno.
        </p>
      </div>

      {data ? (
        <Card className="p-4">
          <StatusExterior data={data} error={ext.error} isValidating={ext.isValidating} mutate={ext.mutate} />
        </Card>
      ) : (
        <CargaExterior data={data} error={ext.error} turno={turno} mutate={ext.mutate} />
      )}

      {data && data.total.secoesRecebidas > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CartaoTotal total={data.total} histInteiro={histInteiro} turno={turno} />
            <ComparacaoJusta ext={data} histZz={histZz.data} turno={turno} carregandoHist={histZz.isLoading} />
          </div>
          <CandidatosExterior ag={data.total} candidatos={data.candidatos} />
        </>
      )}

      {segundo && (
        <>
          <ComparacaoTurnos linha={te.total} carregando={ext1.isLoading} nomeLugar="Exterior" nota={"Exterior: boletins de urna dos dois turnos, somados só nas cidades que já têm boletim no 2º turno (os boletins chegam por fuso horário)."} />
          {ext1.error && <p className="text-sm text-down">1º turno do exterior: {ext1.error.message}</p>}
          <TabelaTurnos
            titulo="1º turno × 2º turno por país"
            linhas={te.paises}
            rotuloLugar="País"
            plural="países"
            rodape={te.total}
            carregando={ext1.isLoading || ext.isLoading}
          />
          <TabelaTurnos
            titulo="1º turno × 2º turno por cidade"
            linhas={te.cidades}
            rotuloLugar="Cidade"
            plural="cidades"
            rodape={te.total}
            carregando={ext1.isLoading || ext.isLoading}
          />
        </>
      )}

      <section aria-labelledby="sec-paises" className="space-y-3">
        <SectionTitle
          id="sec-paises"
          sub={
            data && data.total.secoesRecebidas > 0
              ? "2026 (boletins recebidos) vs resultados finais de 2022 e 2018 — ordenável"
              : "Resultados finais de 2022 e 2018 por país; 2026 aparece conforme os boletins chegam"
          }
        >
          Países
        </SectionTitle>
        {histZz.error && (
          <p className="text-sm text-down">Não foi possível carregar o histórico de 2022/2018: {histZz.error.message}</p>
        )}
        {!histZz.data && !data ? (
          <SkeletonLinhas n={10} />
        ) : (
          <TabelaPaises ext={data} histZz={histZz.data} turno={turno} qs={qs} nomeCidade={nomeCidade} />
        )}
      </section>

      <Card className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted">
          Depois das 17h, a totalização oficial do exterior (por cidade) também aparece na página do Exterior.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/estado/zz${qs}`} className="font-medium text-strong underline underline-offset-2">
            Totalização do exterior →
          </Link>
          <Link href="/boletins?q=exterior" className="font-medium text-strong underline underline-offset-2">
            O que a imprensa noticia →
          </Link>
        </div>
      </Card>

      <p className="text-xs text-muted">
        Fonte: boletins de urna publicados pelo TSE (arquivo-urna) para cada seção no exterior; seções agregadas a outra são
        contadas no boletim da seção principal. 2022 e 2018: dados abertos do TSE por cidade, agrupados por país. Percentuais
        sobre votos válidos.
      </p>
    </div>
  );
}
