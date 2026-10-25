"use client";
// Bloco de comparação de um boletim (ou de números digitados) com 2022, 2018 e os números oficiais de agora.
// Aparece AUTOMATICAMENTE em todos os cards: usa os números do boletim quando o texto traz % de Lula/Flávio;
// senão, os números oficiais do mesmo lugar (TSE no Brasil; boletins de urna já recebidos no exterior).
// Usado nos cards da lista e no comparador manual.
import Link from "next/link";
import type { ReactNode } from "react";
import { BLOCOS } from "@/lib/config";
import { deltaPP, histDe, histPctBloco, livePctBloco, pct } from "@/lib/compare";
import { histPorPais } from "@/lib/exterior/paises";
import { fmtHora, fmtInt, fmtPct, fmtPP } from "@/lib/format";
import { useExterior, useHistBr, useHistMun, useLive, useParamsState } from "@/lib/client/hooks";
import type { BlocoId, EscopoBoletim, ExtAgregado, HistByYear, HistMunFile, LiveResult } from "@/lib/types";
import { cx, ehExterior, fmtPctLivre, useNaTela } from "./util";

const ORDEM: BlocoId[] = ["pt", "bolso"];

const primeiroNome = (s: string) => s.split(" ")[0];

function fin(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

// histórico por país: soma das cidades do exterior (calculado uma vez por arquivo)
const cachePorPais = new WeakMap<HistMunFile, Record<string, HistByYear>>();
function histDoPais(zz: HistMunFile | undefined, pais: string | undefined): HistByYear | null {
  if (!zz || !pais) return null;
  let m = cachePorPais.get(zz);
  if (!m) {
    m = histPorPais(zz);
    cachePorPais.set(zz, m);
  }
  return m[pais] ?? null;
}

type Lider = BlocoId | "outro";

/** Números oficiais de 2026 para o lugar, já em % dos votos válidos. */
interface Oficial {
  estado: "ok" | "carregando" | "aguardando" | "sem-secoes" | "indisponivel";
  pt: number | null;
  bolso: number | null;
  /** quem está em 1º lugar (entre todos os candidatos) */
  lider: Lider | null;
  /** "TSE" (totalização) ou "boletins de urna" (exterior) */
  fonte: "tse" | "bu";
  /** texto curto de cobertura ("62,10% das seções apuradas", "40 de 52 seções") */
  cobertura: string | null;
  atualizadoEm: string | null;
  /** explicação quando não há números */
  aviso: string | null;
}

function liderDeVotos(votos: Record<string, number> | undefined): Lider | null {
  if (!votos) return null;
  let melhor: string | null = null;
  let max = 0;
  for (const [n, v] of Object.entries(votos)) {
    if (v > max) {
      max = v;
      melhor = n;
    } else if (v === max) melhor = null; // empate
  }
  if (!melhor || max <= 0) return null;
  if (melhor === BLOCOS.pt.numeros["2026"]) return "pt";
  if (melhor === BLOCOS.bolso.numeros["2026"]) return "bolso";
  return "outro";
}

function liderLive(r: LiveResult): Lider | null {
  const c = r.candidatos?.[0];
  if (!c || !(c.votos > 0)) return null;
  if (r.candidatos[1] && r.candidatos[1].votos === c.votos) return null;
  if (r.blocos.pt && c.n === r.blocos.pt.n) return "pt";
  if (r.blocos.bolso && c.n === r.blocos.bolso.n) return "bolso";
  return "outro";
}

export interface ComparacaoBoletimProps {
  /** % de votos válidos do Lula citado no boletim */
  pt?: number | null;
  /** % de votos válidos do Flávio citado no boletim */
  bolso?: number | null;
  /** % de urnas apuradas citado no boletim */
  pctApurado?: number | null;
  /** quem o boletim diz que venceu/lidera no lugar ("Lula vence na China") */
  vencedor?: BlocoId | null;
  /** lugar a que os números se referem */
  escopo: EscopoBoletim;
  /** true quando o local não foi detectado e assumimos "Brasil" */
  escopoPresumido?: boolean;
  /** só busca histórico/números oficiais quando o bloco se aproxima da tela (o bloco aparece sempre) */
  lazy?: boolean;
  variante?: "card" | "painel";
  className?: string;
}

/** Δ p.p. com seta (verde = 2026 acima da referência, laranja = abaixo). */
function Delta({ v, casas, alvo, de }: { v: number | null; casas: 1 | 2; alvo: string; de: string }) {
  if (v == null || !Number.isFinite(v)) return null;
  const txt = fmtPP(v, casas);
  const sobe = v > 0.0001;
  const desce = v < -0.0001;
  return (
    <span
      className={cx(
        "block whitespace-nowrap text-[0.85em] font-medium",
        sobe
          ? "text-emerald-700 dark:text-emerald-400"
          : desce
            ? "text-orange-700 dark:text-orange-400"
            : "text-zinc-500 dark:text-zinc-400",
      )}
      title={`${de} ${sobe ? "acima" : desce ? "abaixo" : "igual"} de ${alvo}: ${txt}`}
    >
      <span aria-hidden className="mr-0.5 text-[0.75em]">
        {sobe ? "▲" : desce ? "▼" : "●"}
      </span>
      {txt.replace(" p.p.", "")}
    </span>
  );
}

function Pendente() {
  return (
    <span
      aria-label="carregando"
      className="inline-block h-3 w-9 animate-pulse rounded bg-zinc-200 align-middle dark:bg-zinc-800"
    />
  );
}

function Rotulo({ children, tom }: { children: ReactNode; tom: "boletim" | "oficial" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-wide",
        tom === "boletim"
          ? "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
      )}
    >
      {children}
    </span>
  );
}

/** "Vencedor segundo o boletim" + conferência com os números oficiais. */
function Conferencia({ vencedor, oficial, exterior }: { vencedor: BlocoId; oficial: Oficial; exterior: boolean }) {
  const nome = (b: Lider) => (b === "outro" ? "outro candidato" : primeiroNome(BLOCOS[b].nomes["2026"]));
  const fonte = exterior ? "os boletins de urna" : "o TSE";
  let status: ReactNode;
  if (oficial.estado === "ok" && oficial.lider) {
    const confere = oficial.lider === vencedor;
    status = confere ? (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
        <span aria-hidden>✓</span> confere com {fonte}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 font-semibold text-orange-700 dark:text-orange-400">
        <span aria-hidden>✗</span> diverge: {nome(oficial.lider)} à frente {exterior ? "nos boletins de urna" : "no TSE"}
      </span>
    );
  } else if (oficial.estado === "carregando") {
    status = <Pendente />;
  } else {
    status = <span className="text-zinc-500 dark:text-zinc-400">aguardando números oficiais para conferir</span>;
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2 py-0.5 font-medium text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: BLOCOS[vencedor].cor }} />
        Vencedor segundo o boletim: {nome(vencedor)}
      </span>
      {status}
      {oficial.estado === "ok" && oficial.cobertura && (
        <span className="text-zinc-500 dark:text-zinc-400">({oficial.cobertura})</span>
      )}
    </div>
  );
}

export default function ComparacaoBoletim({
  pt,
  bolso,
  pctApurado,
  vencedor,
  escopo,
  escopoPresumido,
  lazy = false,
  variante = "card",
  className,
}: ComparacaoBoletimProps) {
  const { turno, qs } = useParamsState();
  const { ref, visto } = useNaTela<HTMLDivElement>(lazy);

  const exterior = ehExterior(escopo);
  const uf = escopo.tipo === "br" ? "br" : escopo.uf ? escopo.uf.toLowerCase() : null;
  const mun = escopo.tipo === "mun" ? (escopo.mun ?? null) : null;
  const escopoValido =
    escopo.tipo === "br" ||
    (!!uf && (escopo.tipo === "uf" || (escopo.tipo === "mun" && !!mun) || (escopo.tipo === "pais" && !!escopo.pais)));

  // Histórico (SWR deduplica entre cards). País do exterior = soma das cidades (hist/mun/zz.json).
  const histBr = useHistBr();
  const precisaMun = escopo.tipo === "mun" || escopo.tipo === "pais";
  const histMun = useHistMun(visto && escopoValido && precisaMun ? uf : null);

  // Números oficiais: TSE (Brasil) ou boletins de urna já recebidos (exterior).
  const live = useLive(visto && escopoValido && !exterior ? uf : null, mun);
  const ext = useExterior();

  let hist: HistByYear | null = null;
  let histEstado: "ok" | "carregando" | "indisponivel" = "carregando";
  if (!escopoValido) {
    histEstado = "indisponivel";
  } else if (precisaMun) {
    if (histMun.data) {
      hist = escopo.tipo === "pais" ? histDoPais(histMun.data, escopo.pais) : (mun && histMun.data[mun]) || null;
      histEstado = hist ? "ok" : "indisponivel";
    } else if (histMun.error) {
      histEstado = "indisponivel";
    }
  } else if (histBr.data) {
    hist = (escopo.tipo === "br" ? histBr.data.br : uf ? histBr.data.ufs?.[uf] : null) ?? null;
    histEstado = hist ? "ok" : "indisponivel";
  } else if (histBr.error) {
    histEstado = "indisponivel";
  }

  // --- oficial agora ---
  const oficial: Oficial = {
    estado: "carregando",
    pt: null,
    bolso: null,
    lider: null,
    fonte: exterior ? "bu" : "tse",
    cobertura: null,
    atualizadoEm: null,
    aviso: null,
  };
  if (!escopoValido) {
    oficial.estado = "indisponivel";
  } else if (exterior) {
    const d = ext.data && ext.data.turno === turno ? ext.data : undefined;
    let agg: ExtAgregado | undefined;
    if (d) agg = escopo.tipo === "pais" ? d.paises[escopo.pais ?? ""] : escopo.tipo === "mun" ? d.cidades[mun ?? ""] : d.total;
    if (d && agg && agg.secoesRecebidas > 0 && agg.validos > 0) {
      oficial.estado = "ok";
      oficial.pt = pct(agg.pt, agg.validos);
      oficial.bolso = pct(agg.bo, agg.validos);
      oficial.lider = liderDeVotos(agg.votos);
      oficial.cobertura = `${fmtInt(agg.secoesRecebidas)} de ${fmtInt(agg.secoesTotal)} seções`;
      oficial.atualizadoEm = d.ultimaRecepcao;
    } else if (d) {
      oficial.estado = "sem-secoes";
      oficial.aviso = agg
        ? `Boletins de urna: nenhuma seção de ${escopo.nome} recebida ainda (${fmtInt(agg.secoesTotal)} no total).`
        : `Boletins de urna: sem seções de ${escopo.nome} na lista do TSE.`;
    } else if (ext.error) {
      oficial.estado = ext.error.status === 404 ? "aguardando" : "indisponivel";
      oficial.aviso =
        ext.error.status === 404
          ? `Boletins de urna do exterior ainda não publicados para o ${turno}º turno.`
          : "Boletins de urna do exterior: falha ao carregar.";
    }
  } else {
    // keepPreviousData do useLive pode devolver o lugar anterior enquanto carrega: confere o escopo.
    const ld = live.data;
    const doLugar =
      !!ld &&
      ld.turno === turno &&
      (escopo.tipo === "br"
        ? ld.escopo === "br"
        : escopo.tipo === "uf"
          ? ld.escopo === "uf" && ld.uf === uf
          : ld.escopo === "mun" && ld.uf === uf && ld.mun === mun);
    if (doLugar && (ld.totais.secoesTotalizadas > 0 || ld.totais.validos > 0)) {
      oficial.estado = "ok";
      oficial.pt = livePctBloco(ld, "pt");
      oficial.bolso = livePctBloco(ld, "bolso");
      oficial.lider = liderLive(ld);
      oficial.cobertura = `${fmtPct(ld.totais.pctTotalizado, 2)} das seções apuradas`;
      oficial.atualizadoEm = ld.atualizadoEm;
    } else if (doLugar) {
      oficial.estado = "aguardando";
      oficial.aviso = `TSE: ainda sem seções apuradas em ${escopo.nome}.`;
    } else if (live.error && !live.isLoading) {
      oficial.estado = live.error.status === 404 ? "aguardando" : "indisponivel";
      oficial.aviso =
        live.error.status === 404
          ? turno === 1
            ? "TSE: aguardando 17h (a totalização começa às 17h, horário de Brasília)."
            : "TSE: aguardando a divulgação do 2º turno."
          : "TSE: falha ao carregar os números oficiais.";
    }
  }
  const temOficial = oficial.estado === "ok" && (oficial.pt != null || oficial.bolso != null);

  // --- 2026: números do boletim (se houver) ou oficiais de agora ---
  const doBoletim = fin(pt) != null || fin(bolso) != null;
  const valores: Record<BlocoId, number | null> = doBoletim
    ? { pt: fin(pt), bolso: fin(bolso) }
    : { pt: oficial.pt, bolso: oficial.bolso };
  const rotulo2026 = doBoletim ? "Boletim" : exterior ? "Urnas agora" : "TSE agora";
  const deQuem = doBoletim ? "Boletim" : "Oficial agora";
  const casas: 1 | 2 = variante === "painel" ? 2 : 1;
  const mostraColOficial = doBoletim && temOficial;
  const rotuloOficial = exterior ? "Urnas agora" : "TSE agora";

  const linhas = ORDEM.map((b) => {
    const v = valores[b];
    const p22 = histPctBloco(histDe(hist, "2022", turno), b);
    const p18 = histPctBloco(histDe(hist, "2018", turno), b);
    const pl = oficial.estado === "ok" ? (b === "pt" ? oficial.pt : oficial.bolso) : null;
    return { b, v, p22, p18, pl, d22: deltaPP(v, p22), d18: deltaPP(v, p18), dl: doBoletim ? deltaPP(v, pl) : null };
  });
  const [lPt, lBo] = linhas;
  const temMargem = valores.pt != null && valores.bolso != null;
  const margem = {
    v: deltaPP(lPt.v, lBo.v),
    p22: deltaPP(lPt.p22, lBo.p22),
    p18: deltaPP(lPt.p18, lBo.p18),
    pl: deltaPP(lPt.pl, lBo.pl),
  };

  const th = "px-1 pb-1 text-right font-medium";
  const td = "px-1 py-1.5 text-right align-top";
  const carregando2026 = !doBoletim && oficial.estado === "carregando";

  function celulaHist(p: number | null, d: number | null, alvo: string) {
    if (histEstado === "carregando") return <Pendente />;
    if (p == null) return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
    return (
      <>
        <span className="block text-zinc-700 dark:text-zinc-300">{fmtPct(p, casas)}</span>
        <Delta v={d} casas={casas} alvo={alvo} de={deQuem} />
      </>
    );
  }

  function celula2026(v: number | null) {
    if (v != null) return fmtPctLivre(Math.round(v * 100) / 100);
    if (carregando2026) return <Pendente />;
    return (
      <span
        className="font-normal text-zinc-400 dark:text-zinc-500"
        title={oficial.aviso ?? "Sem número para comparar"}
      >
        —
      </span>
    );
  }

  return (
    <div
      ref={ref}
      className={cx(
        "rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5 sm:p-3 dark:border-zinc-800 dark:bg-zinc-950/50",
        variante === "painel" ? "text-sm" : "text-xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Comparação ·{" "}
          <span className="normal-case tracking-normal text-zinc-800 dark:text-zinc-100">{escopo.nome}</span>
          {escopoPresumido && (
            <span className="font-normal normal-case tracking-normal" title="O boletim não cita o local; assumimos o resultado nacional.">
              {" "}
              (local presumido)
            </span>
          )}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {doBoletim ? (
            <Rotulo tom="boletim">números do boletim</Rotulo>
          ) : (
            <Rotulo tom="oficial">números oficiais agora</Rotulo>
          )}
          <span>{turno}º turno · % dos válidos</span>
        </p>
      </div>

      {vencedor && <Conferencia vencedor={vencedor} oficial={oficial} exterior={exterior} />}

      <table className="mt-1.5 w-full border-collapse tabular-nums">
        <caption className="sr-only">
          {doBoletim ? "Números do boletim" : "Números oficiais de agora"} para {escopo.nome} comparados com 2022 e 2018
          {mostraColOficial ? ` e com ${exterior ? "os boletins de urna" : "o TSE"} agora` : ""}
        </caption>
        <thead>
          <tr className="text-[11px] text-zinc-500 dark:text-zinc-400">
            <th scope="col" className="pb-1 pr-1 text-left font-medium">
              <span className="sr-only">Candidato</span>
            </th>
            <th
              scope="col"
              className={th}
              title={
                doBoletim
                  ? "% citado no boletim"
                  : exterior
                    ? "Boletins de urna das seções do exterior já recebidos pelo TSE"
                    : "Totalização do TSE para o mesmo lugar, agora"
              }
            >
              {rotulo2026}
            </th>
            <th scope="col" className={th}>
              2022
            </th>
            <th scope="col" className={th}>
              2018
            </th>
            {mostraColOficial && (
              <th
                scope="col"
                className={th}
                title={exterior ? "Boletins de urna já recebidos pelo TSE, agora" : "Resultado do TSE para o mesmo lugar, agora"}
              >
                {rotuloOficial}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const bl = BLOCOS[l.b];
            const n26 = primeiroNome(bl.nomes["2026"]);
            const n22 = primeiroNome(bl.nomes["2022"]);
            const n18 = primeiroNome(bl.nomes["2018"]);
            return (
              <tr key={l.b} className="border-t border-zinc-200 dark:border-zinc-800">
                <th scope="row" className="py-1.5 pr-1 text-left align-top font-semibold text-zinc-900 dark:text-zinc-50">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bl.cor }} />
                    {n26}
                  </span>
                  <span className="hidden pl-4 text-[10px] font-normal text-zinc-500 sm:block dark:text-zinc-400">
                    vs {n22} ’22 · {n18} ’18
                  </span>
                </th>
                <td className={cx(td, "font-semibold text-zinc-900 dark:text-zinc-50")}>{celula2026(l.v)}</td>
                <td className={td}>{celulaHist(l.p22, l.d22, `${n22} em 2022`)}</td>
                <td className={td}>{celulaHist(l.p18, l.d18, `${n18} em 2018`)}</td>
                {mostraColOficial && (
                  <td className={td}>
                    {l.pl == null ? (
                      <span className="text-zinc-400 dark:text-zinc-500">—</span>
                    ) : (
                      <>
                        <span className="block text-zinc-700 dark:text-zinc-300">{fmtPct(l.pl, casas)}</span>
                        <Delta v={l.dl} casas={casas} alvo={`${n26} ${exterior ? "nos boletins de urna" : "no TSE"} agora`} de="Boletim" />
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {temMargem && (
            <tr className="border-t border-dashed border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <th scope="row" className="py-1.5 pr-1 text-left align-top text-[11px] font-medium">
                Margem
                <span className="hidden text-[10px] font-normal sm:block">PT − Bolsonaro</span>
              </th>
              <td className={td}>{fmtPP(margem.v, casas).replace(" p.p.", "")}</td>
              <td className={td}>
                {histEstado === "carregando" ? <Pendente /> : fmtPP(margem.p22, casas).replace(" p.p.", "")}
              </td>
              <td className={td}>
                {histEstado === "carregando" ? <Pendente /> : fmtPP(margem.p18, casas).replace(" p.p.", "")}
              </td>
              {mostraColOficial && <td className={td}>{fmtPP(margem.pl, casas).replace(" p.p.", "")}</td>}
            </tr>
          )}
        </tbody>
      </table>

      <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        <li>
          Setas: diferença {doBoletim ? "do boletim" : "dos números oficiais de agora"} para a referência, em pontos
          percentuais.{" "}
          {doBoletim && pctApurado != null && Number.isFinite(pctApurado)
            ? `Boletim com ${fmtPctLivre(pctApurado)} das urnas apuradas; 2022 e 2018 são resultados finais.`
            : "2022 e 2018 são resultados finais."}
          {!doBoletim && temOficial && " 2026 ainda é parcial."}
        </li>
        <li className="sm:hidden">
          Referências: {primeiroNome(BLOCOS.pt.nomes["2022"])} (2022) e {primeiroNome(BLOCOS.pt.nomes["2018"])} (2018);{" "}
          {BLOCOS.bolso.nomes["2022"]} (2022 e 2018).
        </li>
        {temOficial && (
          <li>
            {exterior ? "Boletins de urna (TSE)" : "TSE agora"}: {oficial.cobertura}
            {oficial.atualizadoEm ? ` · ${exterior ? "último recebido" : "atualizado"} às ${fmtHora(oficial.atualizadoEm)}` : ""}.
          </li>
        )}
        {!temOficial && oficial.aviso && (
          <li className={cx(oficial.estado === "aguardando" && "font-medium text-amber-700 dark:text-amber-400")}>
            {oficial.aviso}
          </li>
        )}
        {exterior && escopo.tipo === "pais" && (
          <li>País = soma das cidades com seção eleitoral brasileira; 2022 e 2018 nas mesmas cidades.</li>
        )}
        {histEstado === "indisponivel" && <li>Sem dados de 2022/2018 para este local.</li>}
        {exterior && (
          <li>
            <Link
              href={`/exterior${qs}`}
              className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-300 dark:decoration-zinc-600"
            >
              Ver todos os países (boletins de urna) →
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
