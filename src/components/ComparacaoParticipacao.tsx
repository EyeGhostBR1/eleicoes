// Comparecimento, abstenção, brancos e nulos: 2026 (ao vivo) vs 2022 vs 2018.
import { deltaPP, histDe, pct } from "@/lib/compare";
import { fmtInt, fmtPct } from "@/lib/format";
import type { HistByYear, HistResult, LiveResult, Turno } from "@/lib/types";
import { Card, DeltaPP, SectionTitle, SkeletonLinhas } from "./ui";

interface Valor {
  p: number | null;
  abs: number | null;
}

interface Linha {
  rotulo: string;
  base: string;
  v26: Valor;
  v22: Valor;
  v18: Valor;
}

function deHist(h: HistResult | null): Record<"comp" | "abst" | "vb" | "vn", Valor> {
  return {
    comp: { p: h ? pct(h.comp, h.ap) : null, abs: h?.comp ?? null },
    abst: { p: h ? pct(h.abst, h.ap) : null, abs: h?.abst ?? null },
    vb: { p: h ? pct(h.vb, h.comp) : null, abs: h?.vb ?? null },
    vn: { p: h ? pct(h.vn, h.comp) : null, abs: h?.vn ?? null },
  };
}

function deLive(r: LiveResult | undefined): Record<"comp" | "abst" | "vb" | "vn", Valor> {
  const t = r?.totais;
  const aptosApurados = t ? t.comparecimento + t.abstencao : null;
  return {
    comp: {
      p: t ? (isFinite(t.pctComparecimento) && t.comparecimento > 0 ? t.pctComparecimento : pct(t.comparecimento, aptosApurados)) : null,
      abs: t?.comparecimento ?? null,
    },
    abst: { p: t ? pct(t.abstencao, aptosApurados) : null, abs: t?.abstencao ?? null },
    vb: { p: t ? pct(t.brancos, t.comparecimento) : null, abs: t?.brancos ?? null },
    vn: { p: t ? pct(t.nulos, t.comparecimento) : null, abs: t?.nulos ?? null },
  };
}

function Celula({ v }: { v: Valor }) {
  return (
    <td className="px-2 py-2 text-right" title={v.abs != null ? fmtInt(v.abs) : undefined}>
      <span className="font-medium text-fg">{fmtPct(v.p)}</span>
      {v.abs != null && <span className="block text-[11px] text-muted">{fmtInt(v.abs)}</span>}
    </td>
  );
}

export default function ComparacaoParticipacao({
  live,
  hist,
  turno,
  carregando,
}: {
  live: LiveResult | undefined;
  hist: HistByYear | null | undefined;
  turno: Turno;
  carregando?: boolean;
}) {
  const h22 = deHist(histDe(hist, "2022", turno));
  const h18 = deHist(histDe(hist, "2018", turno));
  const l26 = deLive(live);
  const linhas: Linha[] = [
    { rotulo: "Comparecimento", base: "% do eleitorado", v26: l26.comp, v22: h22.comp, v18: h18.comp },
    { rotulo: "Abstenção", base: "% do eleitorado", v26: l26.abst, v22: h22.abst, v18: h18.abst },
    { rotulo: "Brancos", base: "% do comparecimento", v26: l26.vb, v22: h22.vb, v18: h18.vb },
    { rotulo: "Nulos", base: "% do comparecimento", v26: l26.vn, v22: h22.vn, v18: h18.vn },
  ];
  const semNada = !live && !hist;

  return (
    <Card className="p-4">
      <SectionTitle sub={`${turno}º turno · 2026 considera apenas as seções já totalizadas`}>Participação</SectionTitle>
      {semNada && carregando ? (
        <SkeletonLinhas n={4} />
      ) : (
        <div className="tabela-scroll -mx-1">
          <table className="w-full min-w-[26rem] text-sm">
            <caption className="sr-only">Comparecimento, abstenção, votos brancos e nulos em 2026, 2022 e 2018</caption>
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Indicador
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-semibold text-strong">
                  2026
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  2022
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  2018
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Δ vs 2022
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {linhas.map((l) => (
                <tr key={l.rotulo}>
                  <th scope="row" className="px-2 py-2 text-left font-medium text-fg">
                    {l.rotulo}
                    <span className="block text-[11px] font-normal text-muted">{l.base}</span>
                  </th>
                  <Celula v={l.v26} />
                  <Celula v={l.v22} />
                  <Celula v={l.v18} />
                  <td className="px-2 py-2 text-right">
                    <DeltaPP v={deltaPP(l.v26.p, l.v22.p)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
