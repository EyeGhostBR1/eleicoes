"use client";
// Página de município: resultado ao vivo vs 2022/2018 + comparação com o estado.
import Link from "next/link";
import { useEffect } from "react";
import { BLOCOS, UF_POR_SIGLA } from "@/lib/config";
import { compararLive } from "@/lib/compare";
import { useParamsState } from "@/lib/client/hooks";
import { fmtPct } from "@/lib/format";
import type { HistByYear, LiveResult, Turno } from "@/lib/types";
import AvisoParcial from "../AvisoParcial";
import ComparacaoBlocos from "../ComparacaoBlocos";
import ComparacaoParticipacao from "../ComparacaoParticipacao";
import CardCidadeExterior from "../exterior/CardCidadeExterior";
import StatusApuracao from "../StatusApuracao";
import TabelaCandidatos from "../TabelaCandidatos";
import { Card, DeltaPP, SectionTitle, Skeleton } from "../ui";
import { useHistBr, useHistMun, useIndiceMunicipios, useLiveOk } from "../useDados";

function LinhaContexto({
  rotulo,
  live,
  hist,
  turno,
}: {
  rotulo: string;
  live: LiveResult | undefined;
  hist: HistByYear | null | undefined;
  turno: Turno;
}) {
  const pt = compararLive("pt", live, hist, turno);
  const bo = compararLive("bolso", live, hist, turno);
  return (
    <tr>
      <th scope="row" className="px-2 py-2 text-left font-medium text-fg">
        {rotulo}
      </th>
      <td className="px-2 py-2 text-right font-semibold" style={{ color: "var(--c-pt)" }}>
        {fmtPct(pt.p2026, 1)}
      </td>
      <td className="px-2 py-2 text-right">
        <DeltaPP v={pt.d22} semSufixo />
      </td>
      <td className="px-2 py-2 text-right font-semibold" style={{ color: "var(--c-bolso)" }}>
        {fmtPct(bo.p2026, 1)}
      </td>
      <td className="px-2 py-2 text-right">
        <DeltaPP v={bo.d22} semSufixo />
      </td>
      <td className="px-2 py-2 text-right text-muted">
        {fmtPct(pt.p2022, 1)} × {fmtPct(bo.p2022, 1)}
      </td>
    </tr>
  );
}

export default function CidadeView({ uf, cd }: { uf: string; cd: string }) {
  const info = UF_POR_SIGLA[uf];
  const { turno, qs } = useParamsState();
  const idx = useIndiceMunicipios();
  const t = idx.porCd.get(`${uf}:${cd}`);
  const naoEncontrado = idx.carregado && !t;

  const live = useLiveOk(naoEncontrado ? null : uf, naoEncontrado ? null : cd);
  const liveUf = useLiveOk(naoEncontrado ? null : uf);
  const histMun = useHistMun(uf);
  const histBr = useHistBr();
  const hist = histMun.data?.[cd];
  const carregandoLive = !live.data && !live.error;
  const siglaUf = uf === "zz" ? "Exterior" : uf.toUpperCase();
  const nomeMun = t?.[1];

  // o nome do município só é conhecido no cliente (lista em /data/municipios.json)
  useEffect(() => {
    if (nomeMun) document.title = `${nomeMun} (${siglaUf}) · Apuração 2026`;
  }, [nomeMun, siglaUf]);

  const voltar = (
    <Link href={`/estado/${uf}${qs}`} className="font-medium text-strong underline underline-offset-2">
      Ver todos os {uf === "zz" ? "locais no exterior" : `municípios de ${info.nome}`}
    </Link>
  );

  if (naoEncontrado) {
    return (
      <Card className="p-6">
        <h1 className="text-xl font-bold text-strong">Município não encontrado</h1>
        <p className="mt-2 text-sm text-muted">
          O código {cd} não consta na lista de municípios de {info.nome} da eleição de 2026.
        </p>
        <p className="mt-3 text-sm">{voltar}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <nav aria-label="Trilha" className="text-sm text-muted">
          <Link href={`/${qs}`} className="hover:text-fg hover:underline">
            Brasil
          </Link>{" "}
          <span aria-hidden>›</span>{" "}
          <Link href={`/estado/${uf}${qs}`} className="hover:text-fg hover:underline">
            {info.nome}
          </Link>{" "}
          <span aria-hidden>›</span> <span className="text-fg">{t ? t[1] : cd}</span>
        </nav>
        {t ? (
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-strong sm:text-3xl">
            {t[1]} <span className="text-lg font-medium text-muted">({siglaUf})</span>
          </h1>
        ) : (
          <Skeleton className="mt-2 h-8 w-64" />
        )}
        <p className="mt-1 text-sm text-muted">
          Presidente · {turno}º turno · 2026 vs 2022 e 2018 · {voltar}
        </p>
      </div>

      <div className="space-y-3">
        <StatusApuracao {...live} />
        <AvisoParcial pct={live.data?.totais.pctTotalizado} />
        {uf === "zz" && <CardCidadeExterior cd={cd} hist={hist} />}
      </div>

      <ComparacaoBlocos live={live.data} hist={hist} turno={turno} carregando={carregandoLive} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TabelaCandidatos live={live.data} carregando={carregandoLive} />
        <ComparacaoParticipacao live={live.data} hist={hist} turno={turno} carregando={histMun.isLoading} />
      </div>

      <Card className="p-4">
        <SectionTitle sub="% dos válidos em 2026 e variação (p.p.) vs 2022">
          {t ? t[1] : "Município"} × {info.nome}
        </SectionTitle>
        <div className="tabela-scroll -mx-1">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Comparação do município com o estado</caption>
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Local
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium" style={{ color: "var(--c-pt)" }}>
                  {BLOCOS.pt.nomes["2026"]} 2026
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Δ 22
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium" style={{ color: "var(--c-bolso)" }}>
                  Flávio 2026
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Δ 22
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  2022 (Lula × Jair)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <LinhaContexto rotulo={t ? t[1] : "Município"} live={live.data} hist={hist} turno={turno} />
              <LinhaContexto rotulo={info.nome} live={liveUf.data} hist={histBr.data?.ufs?.[uf]} turno={turno} />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
