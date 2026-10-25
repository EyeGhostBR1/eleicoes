// Tabela dos três cenários nacionais (base 2022 / base 2018 / proporcional) + parcial de agora.
import { fmtCompact, fmtInt, fmtPct } from "@/lib/format";
import type { EstimativaLugar, Turno } from "@/lib/types";
import { Card, corTextoBloco, cx } from "../ui";
import { CENARIOS, dif, textoMargem } from "./util";

export default function TabelaCenarios({ br, turno }: { br: EstimativaLugar; turno: Turno }) {
  const mostrarOutros = turno === 1;
  return (
    <Card className="p-4" aria-labelledby="sec-cenarios">
      <h2 id="sec-cenarios" className="text-base font-semibold text-strong">
        Cenários
      </h2>
      <p className="mt-0.5 text-sm text-muted">Três formas de projetar as seções que ainda faltam apurar.</p>
      <div className="tabela-scroll mt-3">
        <table className="w-full min-w-[27rem] text-sm">
          <caption className="sr-only">
            Estimativa nacional do resultado final em cada cenário, em % dos votos válidos, e o parcial atual.
          </caption>
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                Cenário
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium" style={{ color: corTextoBloco("pt") }}>
                Lula
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium" style={{ color: corTextoBloco("bolso") }}>
                Flávio
              </th>
              {mostrarOutros && (
                <th scope="col" className="px-2 py-1.5 text-right font-medium">
                  Outros
                </th>
              )}
              <th scope="col" className="px-2 py-1.5 text-right font-medium" title="Votos válidos totais estimados">
                Válidos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {CENARIOS.map((c) => {
              const v = br.cenarios[c.id];
              const principal = c.id === "base2022";
              return (
                <tr key={c.id} className={cx(principal && "bg-surface-2/60")}>
                  <th scope="row" className="min-w-[11rem] max-w-[16rem] px-2 py-2 text-left align-top font-normal">
                    <span className={cx("block text-strong", principal ? "font-semibold" : "font-medium")}>{c.rotulo}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted">{c.explicacao}</span>
                  </th>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top font-semibold" style={{ color: corTextoBloco("pt") }}>
                    {fmtPct(v?.pt.pct, 1)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top font-semibold" style={{ color: corTextoBloco("bolso") }}>
                    {fmtPct(v?.bolso.pct, 1)}
                  </td>
                  {mostrarOutros && (
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top text-fg">{fmtPct(v?.outros.pct, 1)}</td>
                  )}
                  <td className="whitespace-nowrap px-2 py-2 text-right align-top text-muted" title={`${fmtInt(v?.validos)} votos válidos`}>
                    {fmtCompact(v?.validos)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line">
              <th scope="row" className="px-2 py-2 text-left align-top font-normal">
                <span className="block font-medium text-strong">Parcial agora</span>
                <span className="mt-0.5 block text-xs text-muted">
                  O que já foi apurado ({fmtPct(br.pctTotalizado, 1)} das seções) — {textoMargem(dif(br.parcial.pt, br.parcial.bolso), "2026")}
                </span>
              </th>
              <td className="whitespace-nowrap px-2 py-2 text-right align-top text-fg">{fmtPct(br.parcial.pt, 1)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right align-top text-fg">{fmtPct(br.parcial.bolso, 1)}</td>
              {mostrarOutros && (
                <td className="whitespace-nowrap px-2 py-2 text-right align-top text-fg">
                  {br.parcial.pt != null && br.parcial.bolso != null
                    ? fmtPct(Math.max(0, 100 - br.parcial.pt - br.parcial.bolso), 1)
                    : "—"}
                </td>
              )}
              <td className="whitespace-nowrap px-2 py-2 text-right align-top text-muted" title={`${fmtInt(br.parcial.validos)} votos válidos apurados`}>
                {fmtCompact(br.parcial.validos)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
