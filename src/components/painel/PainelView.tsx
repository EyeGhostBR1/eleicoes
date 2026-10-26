"use client";
// Painel 1º × 2º turno (/painel): resultado e TEMPO DE APURAÇÃO dos estados e das maiores cidades.
//
// "Tempo de apuração" = minutos após o fechamento das urnas (1º turno 17h; 2º turno 19h, por decisão
// do STF). O TSE não publica o histórico da apuração; o ritmo é medido pela hora em que cada
// município concluiu (acompanhamento do TSE) — a mesma medida nos dois turnos (/api/tse/tempos).
//
// Visão Brasil: relógio, ritmo nacional, pequenos múltiplos por estado, tabela de ritmo por estado,
// as 50 maiores cidades (resultado + tempo) e o resultado 1º × 2º por estado.
// Visão estado (?uf=): relógio, ritmo do estado, vantagem acumulada nos municípios concluídos e
// todos os municípios (maiores primeiro) com resultado e tempo nos dois turnos.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { useCidades, useEstadosTurno, useMunicipiosTurno, useTempos } from "@/lib/client/hooks";
import { pct } from "@/lib/compare";
import { FECHAMENTO_URNAS, TURNOS_FINALIZADOS, UFS, UF_POR_SIGLA } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import { linhaTurnos, valTurnoDeLive } from "@/lib/turnos";
import type { CidadeResultado, LiveMunRow, TemposLugar, TemposMunicipio, TemposResponse } from "@/lib/types";
import ComparacaoTurnos from "../turnos/ComparacaoTurnos";
import TabelaTurnos from "../turnos/TabelaTurnos";
import { Card, ErroCarga, SectionTitle, Skeleton, SkeletonLinhas } from "../ui";
import { useIndiceMunicipios } from "../useDados";
import GraficoTempo, { LegendaTempo, type SerieTempo } from "./GraficoTempo";
import TabelaPainel from "./TabelaPainel";
import {
  GRUPOS_LUGARES,
  GRUPOS_RITMO,
  colunasLugares,
  colunasRitmo,
  lider,
  type LadoTurno,
  type LinhaLugarTempo,
  type LinhaRitmo,
} from "./colunas";
import { curvaVantagem, estender, fmtDuracao, fmtVantagem, minutosApos, relogio, valorNaCurva } from "./tempo";

const F1 = FECHAMENTO_URNAS[1];
const F2 = FECHAMENTO_URNAS[2];
const ORDEM_REGIAO = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
/** 2º turno encerrado: comparações "no mesmo horário" passam a usar o fim da apuração do 2º turno */
const ENCERRADO2 = TURNOS_FINALIZADOS.includes(2);
const UFS_PAINEL = UFS.filter((u) => u.sigla !== "zz");

const SERIE_T1 = { id: "t1", rotulo: "1º turno (urnas fecharam 17h)", curto: "1º turno", cor: "var(--viz-ref)", tracejado: true, fechamento: F1 };
const SERIE_T2 = { id: "t2", rotulo: "2º turno (urnas fecharam 19h)", curto: "2º turno", cor: "var(--viz-foco)", fechamento: F2 };
const fmtPctEixo = (v: number) => `${v}%`;
const fmtPct1 = (v: number) => fmtPct(v, 1);
const pctInteiro = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

function Tile({ rotulo, valor, sub }: { rotulo: string; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{rotulo}</p>
      <p className="mt-0.5 text-2xl font-semibold leading-tight text-strong">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Séries de ritmo (1º turno estendido até o fim do eixo — depois de concluído nada muda). */
function seriesRitmo(t1: TemposLugar | null | undefined, t2: TemposLugar | null | undefined): SerieTempo[] {
  const n = Math.max(t1?.curva.length ?? 0, t2?.curva.length ?? 0);
  return [
    { ...SERIE_T1, pontos: t1 ? estender(t1.curva, n) : [] },
    { ...SERIE_T2, pontos: t2?.curva ?? [] },
  ];
}

function Relogio({
  t1,
  t2,
  tempos2,
  pa2,
  refMin,
}: {
  t1: TemposLugar | null | undefined;
  t2: TemposLugar | null | undefined;
  tempos2: TemposResponse | undefined;
  pa2: number | null;
  /** minuto de comparação: agora (apuração em andamento) ou o fim da apuração do 2º turno */
  refMin: number;
}) {
  const agora = tempos2?.agoraMin ?? null;
  const conc2 = t2?.curva.length ? t2.curva[t2.curva.length - 1] : null;
  const mesmo1 = t1 && tempos2 ? valorNaCurva(t1.curva, tempos2.passoMin, refMin, true) : null;
  const dif = conc2 != null && mesmo1 != null ? conc2 - mesmo1 : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {ENCERRADO2 ? (
        <Tile rotulo="2º turno encerrado" valor="19h" sub={`urnas fecharam às 19h · última conclusão às ${relogio(F2, refMin)}`} />
      ) : (
        <Tile
          rotulo="Tempo desde o fechamento (19h)"
          valor={agora != null && agora >= 0 ? fmtDuracao(agora) : "—"}
          sub={agora != null ? `agora: ${relogio(F2, agora)}` : undefined}
        />
      )}
      <Tile rotulo="Seções apuradas (2º turno)" valor={pa2 != null ? fmtPct(pa2, 1) : "—"} sub={ENCERRADO2 ? "resultado final do TSE" : "o que o TSE mostra agora"} />
      <Tile
        rotulo="Eleitorado em municípios concluídos"
        valor={conc2 != null ? fmtPct(conc2, 1) : "—"}
        sub={
          mesmo1 != null ? (
            <>
              1º turno {ENCERRADO2 ? "no mesmo tempo" : "no mesmo horário"}: {fmtPct(mesmo1, 1)}
              {dif != null && ` (${dif >= 0 ? "+" : "−"}${fmtPct(Math.abs(dif), 1).replace("%", "")} p.p.)`}
            </>
          ) : undefined
        }
      />
      <Tile
        rotulo="1º turno: concluído em"
        valor={fmtDuracao(t1?.m100)}
        sub={t1 ? `50% em ${fmtDuracao(t1.m50)} · 90% em ${fmtDuracao(t1.m90)}` : undefined}
      />
      <Tile
        rotulo="2º turno: concluído em"
        valor={t2?.m100 != null ? fmtDuracao(t2.m100) : ENCERRADO2 ? "—" : "em andamento"}
        sub={t2 ? `50% em ${t2.m50 != null ? fmtDuracao(t2.m50) : "—"} · 90% em ${t2.m90 != null ? fmtDuracao(t2.m90) : "—"}` : undefined}
      />
    </div>
  );
}

function ladoCidade(c: CidadeResultado | undefined, fech: string, encerrado: boolean): LadoTurno | null {
  const r = c?.r;
  if (!r || !(r.vv > 0)) return null;
  const completo = r.pa >= 99.995 || encerrado;
  return {
    pt: pct(r.pt, r.vv),
    bo: pct(r.bo, r.vv),
    vpt: r.pt,
    vbo: r.bo,
    pa: r.pa,
    completo,
    m: completo || r.finalizado ? minutosApos(r.atualizadoEm, fech) : null,
  };
}

function ladoMunicipio(row: LiveMunRow | undefined, tm: TemposMunicipio | undefined, encerrado: boolean): LadoTurno | null {
  if (!row || !(row.vv > 0)) return null;
  return {
    pt: pct(row.pt, row.vv),
    bo: pct(row.bo, row.vv),
    vpt: row.pt,
    vbo: row.bo,
    pa: row.pa,
    completo: row.pa >= 99.995 || encerrado,
    m: tm?.m ?? null,
  };
}

function montarLinha(base: { id: string; nome: string; sub?: string; href?: string }, eleitorado: number, t1: LadoTurno | null, t2: LadoTurno | null): LinhaLugarTempo {
  const l1 = lider(t1);
  const l2 = lider(t2);
  return { ...base, peso: eleitorado, eleitorado, t1, t2, lider1: l1, lider2: l2, destaque: !!l1 && !!l2 && l1 !== l2 };
}

export default function PainelView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ufParam = (sp.get("uf") ?? "").toLowerCase();
  const uf = UF_POR_SIGLA[ufParam] && ufParam !== "zz" ? ufParam : null;
  const escolher = (v: string) => router.replace(v ? `${pathname}?uf=${v}` : pathname, { scroll: false });

  const tempos1 = useTempos(1, uf);
  const tempos2 = useTempos(2, uf);
  const est1 = useEstadosTurno(1);
  const est2 = useEstadosTurno(2);
  const cid1 = useCidades(uf ? null : 1);
  const cid2 = useCidades(uf ? null : 2);
  const mun1 = useMunicipiosTurno(uf, 1);
  const mun2 = useMunicipiosTurno(uf, 2);
  const idx = useIndiceMunicipios();

  const T1 = tempos1.data;
  const T2 = tempos2.data;
  const passo = T2?.passoMin ?? T1?.passoMin ?? 5;
  // minuto de referência das comparações "no mesmo horário": agora ou, com o 2º turno encerrado,
  // o fim da apuração do 2º turno (última conclusão)
  const fim2 = T2 ? (T2.br.curva.length - 1) * passo : 0;
  const agora2 = ENCERRADO2 ? fim2 : (T2?.agoraMin ?? 0);
  const agoraGrafico = T2 && !ENCERRADO2 ? agora2 : null;
  const lugar1 = uf ? T1?.ufs[uf] : T1?.br;
  const lugar2 = uf ? T2?.ufs[uf] : T2?.br;
  const nomeLugar = uf ? UF_POR_SIGLA[uf].nome : "Brasil";
  const res2 = uf ? est2.data?.ufs[uf] : est2.data?.br;

  // resultado 1º × 2º (Brasil / UF) e por estado
  const turnosLugar = useMemo(() => {
    const r1 = uf ? est1.data?.ufs[uf] : est1.data?.br;
    return r1 ? linhaTurnos({ id: uf ?? "br", nome: nomeLugar }, valTurnoDeLive(r1), valTurnoDeLive(res2)) : null;
  }, [est1.data, res2, uf, nomeLugar]);
  const turnosUfs = useMemo(
    () =>
      est1.data
        ? UFS_PAINEL.map((u) =>
            linhaTurnos(
              { id: u.sigla, nome: u.nome, sub: u.sigla.toUpperCase(), href: `/estado/${u.sigla}` },
              valTurnoDeLive(est1.data!.ufs[u.sigla]),
              valTurnoDeLive(est2.data?.ufs[u.sigla]),
            ),
          )
        : [],
    [est1.data, est2.data],
  );

  // ritmo por estado
  const linhasRitmo = useMemo<LinhaRitmo[]>(
    () =>
      UFS_PAINEL.map((u) => {
        const a = T1?.ufs[u.sigla] ?? null;
        const b = T2?.ufs[u.sigla] ?? null;
        return {
          id: u.sigla,
          nome: u.nome,
          sub: u.sigla.toUpperCase(),
          peso: b?.eleitorado || a?.eleitorado || 0,
          t1: a,
          t2: b,
          agora2: b?.curva.length ? b.curva[b.curva.length - 1] : null,
          mesmo1: a ? valorNaCurva(a.curva, passo, agora2, true) : null,
        };
      }),
    [T1, T2, passo, agora2],
  );
  const rodapeRitmo = useMemo<LinhaRitmo | null>(
    () =>
      T1 || T2
        ? {
            id: "br",
            nome: "Brasil",
            peso: 0,
            t1: T1?.br ?? null,
            t2: T2?.br ?? null,
            agora2: T2?.br.curva.length ? T2.br.curva[T2.br.curva.length - 1] : null,
            mesmo1: T1 ? valorNaCurva(T1.br.curva, passo, agora2, true) : null,
          }
        : null,
    [T1, T2, passo, agora2],
  );

  // maiores cidades (visão Brasil)
  const linhasCidades = useMemo<LinhaLugarTempo[]>(() => {
    const c1 = new Map((cid1.data?.cidades ?? []).map((c) => [c.cd, c]));
    return (cid2.data?.cidades ?? cid1.data?.cidades ?? []).map((c) => {
      const a = c1.get(c.cd);
      const b = cid2.data?.cidades.find((x) => x.cd === c.cd);
      return montarLinha(
        { id: c.cd, nome: c.nome, sub: c.uf.toUpperCase(), href: `/cidade/${c.uf}/${c.cd}` },
        b?.r?.ap || a?.r?.ap || 0,
        ladoCidade(a, F1, true),
        ladoCidade(b, F2, ENCERRADO2),
      );
    });
  }, [cid1.data, cid2.data]);

  // municípios da UF (visão estado)
  const linhasMuns = useMemo<LinhaLugarTempo[]>(() => {
    if (!uf) return [];
    const tuplas = idx.porUf.get(uf) ?? [];
    return tuplas.map((t) => {
      const [cd, nome] = t;
      const r1 = mun1.data?.municipios[cd];
      const r2 = mun2.data?.municipios[cd];
      return montarLinha(
        { id: cd, nome, href: `/cidade/${uf}/${cd}` },
        r2?.ap || r1?.ap || T2?.municipios?.[cd]?.te || 0,
        ladoMunicipio(r1, T1?.municipios?.[cd], true),
        ladoMunicipio(r2, T2?.municipios?.[cd], ENCERRADO2),
      );
    });
  }, [uf, idx.porUf, mun1.data, mun2.data, T1, T2]);

  // vantagem acumulada nos municípios concluídos, na ordem de conclusão (visão estado)
  const seriesVantagem = useMemo<SerieTempo[] | null>(() => {
    if (!uf || !T1?.municipios || !mun1.data) return null;
    const eventos = (t: TemposResponse | undefined, rows: Record<string, LiveMunRow> | undefined) => {
      const ev: [number, number, number, number][] = [];
      for (const [cd, tm] of Object.entries(t?.municipios ?? {})) {
        const r = rows?.[cd];
        if (tm.m != null && r && r.vv > 0) ev.push([tm.m, r.pt, r.bo, r.vv]);
      }
      return ev;
    };
    const n1 = T1.ufs[uf]?.curva.length ?? 1;
    const n2 = T2?.ufs[uf]?.curva.length ?? 0;
    const v1 = curvaVantagem(eventos(T1, mun1.data.municipios), passo, (n1 - 1) * passo);
    const v2 = n2 && mun2.data ? curvaVantagem(eventos(T2, mun2.data.municipios), passo, (n2 - 1) * passo) : [];
    return [
      { ...SERIE_T1, pontos: estender(v1, Math.max(n1, n2)) },
      { ...SERIE_T2, pontos: v2 },
    ];
  }, [uf, T1, T2, mun1.data, mun2.data, passo]);

  // escala simétrica da vantagem: múltiplo de 10 acima do maior |valor| (mín. 10)
  const escalaVantagem = useMemo(() => {
    let m = 0;
    for (const s of seriesVantagem ?? []) for (const v of s.pontos) if (v != null && isFinite(v)) m = Math.max(m, Math.abs(v));
    return Math.max(10, Math.ceil(m / 10) * 10);
  }, [seriesVantagem]);

  const colLugares = useMemo(() => colunasLugares(F1, F2, agora2), [agora2]);
  const colRitmo = useMemo(() => colunasRitmo(), []);
  const erro = tempos1.error ?? tempos2.error;

  const ufsPorRegiao = useMemo(
    () =>
      UFS_PAINEL.slice().sort(
        (a, b) =>
          ORDEM_REGIAO.indexOf(a.regiao) - ORDEM_REGIAO.indexOf(b.regiao) ||
          (T2?.ufs[b.sigla]?.eleitorado ?? 0) - (T2?.ufs[a.sigla]?.eleitorado ?? 0),
      ),
    [T2],
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted">Eleição presidencial 2026 · 1º × 2º turno</p>
        <h1 className="text-2xl font-bold tracking-tight text-strong sm:text-3xl">Painel 1º × 2º turno{uf ? ` — ${nomeLugar}` : ""}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Resultado e tempo de apuração de estados e maiores cidades nos dois turnos. Tempo = minutos depois do fechamento
          das urnas: 17h no 1º turno, 19h no 2º turno (horário de Brasília). O ritmo é medido pela hora em que cada município
          concluiu a apuração, segundo o acompanhamento do TSE.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="painel-uf" className="text-sm text-muted">
          Local:
        </label>
        <select
          id="painel-uf"
          value={uf ?? ""}
          onChange={(e) => escolher(e.target.value)}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm font-medium"
        >
          <option value="">Brasil (estados e maiores cidades)</option>
          {UFS_PAINEL.map((u) => (
            <option key={u.sigla} value={u.sigla}>
              {u.nome} (municípios)
            </option>
          ))}
        </select>
        {uf && (
          <button type="button" onClick={() => escolher("")} className="text-sm text-muted underline underline-offset-2 hover:text-fg">
            Voltar ao Brasil
          </button>
        )}
      </div>

      {erro && <ErroCarga msg={`Tempo de apuração: ${erro.message}`} onRetry={() => (void tempos1.mutate(), void tempos2.mutate())} />}

      {!T1 && !T2 ? <Skeleton className="h-24 w-full" /> : <Relogio t1={lugar1} t2={lugar2} tempos2={T2} pa2={res2?.totais.pctTotalizado ?? lugar2?.pa ?? null} refMin={agora2} />}

      <Card className="p-4 sm:p-5">
        <SectionTitle sub="% do eleitorado em municípios com a apuração concluída, por tempo depois do fechamento das urnas">
          Ritmo da apuração — {nomeLugar}
        </SectionTitle>
        {!lugar1 && !lugar2 ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <GraficoTempo
            series={seriesRitmo(lugar1, lugar2)}
            passoMin={passo}
            yMin={0}
            yMax={100}
            ticksY={[0, 25, 50, 75, 100]}
            fmtY={fmtPctEixo}
            fmtValor={fmtPct1}
            agoraMin={agoraGrafico}
            ariaLabel={`Ritmo da apuração em ${nomeLugar}: 1º turno e 2º turno`}
          />
        )}
      </Card>

      {uf && (
        <Card className="p-4 sm:p-5">
          <SectionTitle sub="Lula − Flávio (p.p. dos válidos) somando só os municípios já concluídos, na ordem em que concluíram — como a vantagem foi se formando ao longo da noite">
            Vantagem acumulada — {nomeLugar}
          </SectionTitle>
          {!seriesVantagem ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <GraficoTempo
              series={seriesVantagem}
              passoMin={passo}
              yMin={-escalaVantagem}
              yMax={escalaVantagem}
              ticksY={[-escalaVantagem, -escalaVantagem / 2, 0, escalaVantagem / 2, escalaVantagem]}
              fmtY={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)}
              fmtValor={fmtVantagem}
              polaridade={{ acima: "Lula à frente", abaixo: "Flávio à frente" }}
              agoraMin={agoraGrafico}
              ariaLabel={`Vantagem acumulada nos municípios concluídos em ${nomeLugar}: 1º e 2º turno`}
            />
          )}
        </Card>
      )}

      {uf && <ComparacaoTurnos linha={turnosLugar} carregando={est1.isLoading} nomeLugar={nomeLugar} />}

      {!uf && (
        <Card className="space-y-3 p-4 sm:p-5">
          <SectionTitle sub="Cada quadro: % do eleitorado do estado em municípios concluídos ao longo da noite. Clique no nome para abrir o estado.">
            Ritmo por estado
          </SectionTitle>
          <LegendaTempo series={[SERIE_T1, SERIE_T2]} />
          {!T1 && !T2 ? (
            <SkeletonLinhas n={6} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {ufsPorRegiao.map((u) => {
                const a = T1?.ufs[u.sigla];
                const b = T2?.ufs[u.sigla];
                const agoraB = b?.curva.length ? b.curva[b.curva.length - 1] : null;
                return (
                  <div key={u.sigla} className="rounded-lg border border-line p-2">
                    <button
                      type="button"
                      onClick={() => escolher(u.sigla)}
                      className="flex w-full items-baseline justify-between gap-1 text-left text-sm font-semibold text-strong hover:underline"
                    >
                      <span className="truncate">{u.nome}</span>
                      <span className="text-[11px] font-normal text-muted">{u.regiao}</span>
                    </button>
                    <p className="text-[11px] text-muted">
                      2º: {pctInteiro(agoraB)}{ENCERRADO2 ? "" : " agora"} · 1º: {pctInteiro(a ? valorNaCurva(a.curva, passo, agora2, true) : null)}
                    </p>
                    <GraficoTempo
                      compacto
                      series={seriesRitmo(a, b)}
                      passoMin={passo}
                      yMin={0}
                      yMax={100}
                      ticksY={[0, 100]}
                      fmtY={fmtPctEixo}
                      fmtValor={fmtPct1}
                      altura={96}
                      agoraMin={agoraGrafico}
                      ariaLabel={`Ritmo da apuração em ${u.nome}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {!uf && (
        <Card className="space-y-3 p-4 sm:p-5">
          <SectionTitle sub="Seções apuradas e eleitorado em municípios concluídos agora × 1º turno no mesmo tempo depois do fechamento; tempo até 50%, 90% e 100% do eleitorado concluído em cada turno. Clique num estado para abrir os municípios.">
            Tempo de apuração por estado
          </SectionTitle>
          {!T1 && !T2 ? (
            <SkeletonLinhas n={8} />
          ) : (
            <TabelaPainel
              linhas={linhasRitmo}
              colunas={colRitmo}
              grupos={GRUPOS_RITMO}
              rotuloLugar="Estado"
              plural="estados"
              rodape={rodapeRitmo}
              caption="Tempo de apuração por estado nos dois turnos"
              onSelecionar={(l) => escolher(l.id)}
            />
          )}
        </Card>
      )}

      {!uf && (
        <Card className="space-y-3 p-4 sm:p-5">
          <SectionTitle sub="As 50 maiores cidades do país: Lula e Flávio em cada turno (% dos válidos e votos), quanto tempo cada uma levou para concluir a apuração e a comparação entre os turnos.">
            Maiores cidades — resultado e tempo de apuração
          </SectionTitle>
          {cid1.error && <ErroCarga msg={`Cidades (1º turno): ${cid1.error.message}`} onRetry={() => void cid1.mutate()} />}
          {cid2.error && cid2.error.status !== 404 && <ErroCarga msg={`Cidades (2º turno): ${cid2.error.message}`} onRetry={() => void cid2.mutate()} />}
          {!linhasCidades.length ? (
            <SkeletonLinhas n={10} />
          ) : (
            <TabelaPainel
              linhas={linhasCidades}
              colunas={colLugares}
              grupos={GRUPOS_LUGARES}
              rotuloLugar="Cidade"
              plural="cidades"
              pagina={50}
              caption="Maiores cidades: resultado e tempo de apuração no 1º e no 2º turno"
            />
          )}
        </Card>
      )}

      {uf && (
        <Card className="space-y-3 p-4 sm:p-5">
          <SectionTitle sub="Todos os municípios do estado, maiores primeiro: Lula e Flávio em cada turno, quanto tempo cada um levou para concluir a apuração e a comparação entre os turnos.">
            Municípios de {nomeLugar} — resultado e tempo de apuração
          </SectionTitle>
          {mun1.error && <ErroCarga msg={`Municípios (1º turno): ${mun1.error.message}`} onRetry={() => void mun1.mutate()} />}
          {!linhasMuns.length || !mun1.data ? (
            <SkeletonLinhas n={10} />
          ) : (
            <TabelaPainel
              key={uf}
              linhas={linhasMuns}
              colunas={colLugares}
              grupos={GRUPOS_LUGARES}
              rotuloLugar="Município"
              plural="municípios"
              caption={`Municípios de ${nomeLugar}: resultado e tempo de apuração no 1º e no 2º turno`}
            />
          )}
        </Card>
      )}

      {!uf && (
        <TabelaTurnos linhas={turnosUfs} rotuloLugar="Estado" plural="estados" carregando={est1.isLoading} titulo="Resultado 1º × 2º turno por estado" pagina={30} />
      )}

      <p className="text-xs text-muted">
        Como medimos: o TSE informa, para cada município, se a apuração terminou e a hora da última totalização. O painel
        soma o eleitorado dos municípios concluídos a cada 5 minutos depois do fechamento das urnas. Municípios grandes
        apuram aos poucos e só entram quando terminam; por isso &quot;eleitorado em municípios concluídos&quot; fica abaixo
        de &quot;seções apuradas&quot; durante a noite. Totalizações registradas mais de 12 horas depois do fechamento
        (retotalizações) ficam fora das curvas. {fmtInt(T1?.br.tardios ?? 0)} municípios do 1º turno estão nesse caso.
      </p>
    </div>
  );
}
