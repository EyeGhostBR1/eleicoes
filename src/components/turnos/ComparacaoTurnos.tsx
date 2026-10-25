"use client";
// Card "1º × 2º turno de 2026" de um lugar: % e votos de Lula e Flávio nos dois turnos,
// variação em p.p. e em votos, comparecimento e saldo (quem herdou mais).
import type { ReactNode } from "react";
import { BLOCOS } from "@/lib/config";
import { deltaPP } from "@/lib/compare";
import { fmtInt, fmtPct, fmtPP } from "@/lib/format";
import { type LinhaTurnos, pctComparecimento } from "@/lib/turnos";
import type { BlocoId } from "@/lib/types";
import { Card, DeltaPP, SectionTitle, SkeletonLinhas, corTextoBloco } from "../ui";

/** Δ votos: só com o 2º turno totalmente apurado no lugar (antes disso a comparação é injusta). */
export function DeltaVotos({ v, completo }: { v: number | null; completo: boolean }) {
  if (v == null) return <span className="text-muted">—</span>;
  if (!completo) return <span className="text-xs text-muted" title="Disponível com 100% das seções do 2º turno apuradas">apurando</span>;
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "±";
  return (
    <span className={v > 0 ? "font-medium text-up" : v < 0 ? "font-medium text-down" : "text-muted"}>
      {sinal}
      {fmtInt(Math.abs(v))}
    </span>
  );
}

export function apuracaoCompleta(l: LinhaTurnos): boolean {
  return (l.t2?.pa ?? 0) >= 99.995;
}

function LinhaBloco({ l, b }: { l: LinhaTurnos; b: BlocoId }) {
  const d = b === "pt" ? l.pt : l.bo;
  return (
    <tr>
      <th scope="row" className="px-2 py-2 text-left font-semibold" style={{ color: corTextoBloco(b) }}>
        {BLOCOS[b].nomes["2026"]}
      </th>
      <td className="px-2 py-2 text-right">{fmtPct(d.p1, 2)}</td>
      <td className="px-2 py-2 text-right font-semibold">{fmtPct(d.p2, 2)}</td>
      <td className="px-2 py-2 text-right">
        <DeltaPP v={d.dpp} casas={2} semSufixo />
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{fmtInt(d.v1)}</td>
      <td className="px-2 py-2 text-right tabular-nums">{fmtInt(d.v2)}</td>
      <td className="px-2 py-2 text-right tabular-nums">
        <DeltaVotos v={d.dv} completo={apuracaoCompleta(l)} />
      </td>
    </tr>
  );
}

/** Texto-resumo de quem herdou mais votos entre os turnos. */
export function frase(l: LinhaTurnos): string | null {
  if (l.pt.dpp == null || l.bo.dpp == null || l.dMargem == null) return null;
  const quem = l.dMargem > 0 ? "Lula" : "Flávio";
  const partes = [
    `Lula ${fmtPP(l.pt.dpp, 1)} e Flávio ${fmtPP(l.bo.dpp, 1)} em relação ao 1º turno`,
    Math.abs(l.dMargem) < 0.05 ? "saldo equilibrado entre os dois" : `${quem} ganhou mais terreno (${fmtPP(Math.abs(l.dMargem), 1).replace("+", "")} de saldo)`,
  ];
  if (l.virou) partes.push(`a liderança mudou: ${l.lider2 === "pt" ? "Lula" : "Flávio"} passou à frente`);
  return partes.join("; ") + ".";
}

export default function ComparacaoTurnos({
  linha,
  carregando,
  nomeLugar,
  nota,
}: {
  linha: LinhaTurnos | null;
  carregando?: boolean;
  nomeLugar: string;
  /** observação extra abaixo do título (ex.: base de comparação do exterior) */
  nota?: ReactNode;
}) {
  const sem2 = !linha?.t2;
  const comp1 = pctComparecimento(linha?.t1 ?? null);
  const comp2 = pctComparecimento(linha?.t2 ?? null);
  const outros1 = linha?.t1 && linha.pt.p1 != null && linha.bo.p1 != null ? 100 - linha.pt.p1 - linha.bo.p1 : null;
  const resumo = linha ? frase(linha) : null;
  return (
    <Card className="p-4">
      <SectionTitle
        sub={`${nomeLugar}: % dos votos válidos e votos de cada candidato no 1º turno (04/10) e no 2º turno (25/10)`}
      >
        1º × 2º turno de 2026
      </SectionTitle>
      {carregando && !linha ? (
        <SkeletonLinhas n={3} />
      ) : !linha?.t1 ? (
        <p className="text-sm text-muted">Resultado do 1º turno indisponível no momento.</p>
      ) : (
        <div className="space-y-3">
          {nota && <p className="text-xs text-muted">{nota}</p>}
          {sem2 && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
              Ainda não há resultados do 2º turno aqui. Abaixo, o 1º turno.
            </p>
          )}
          {resumo && <p className="text-sm text-fg">{resumo}</p>}
          <div className="tabela-scroll -mx-1">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">Comparação entre o 1º e o 2º turno de 2026 em {nomeLugar}</caption>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    Candidato
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    % 1º turno
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    % 2º turno
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Δ p.p.
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Votos 1º
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Votos 2º
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Δ votos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <LinhaBloco l={linha} b="pt" />
                <LinhaBloco l={linha} b="bolso" />
              </tbody>
            </table>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">Outros candidatos no 1º turno</dt>
              <dd className="font-medium">{fmtPct(outros1, 2)} dos válidos</dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">Comparecimento 1º → 2º</dt>
              <dd className="font-medium">
                {fmtPct(comp1, 1)} → {fmtPct(comp2, 1)}{" "}
                {comp1 != null && comp2 != null && <DeltaPP v={deltaPP(comp2, comp1)} semSufixo className="text-xs" />}
              </dd>
            </div>
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-muted">Apurado no 2º turno</dt>
              <dd className="font-medium">{fmtPct(linha.t2?.pa ?? 0, 2)}</dd>
            </div>
          </dl>
          {!sem2 && !apuracaoCompleta(linha) && (
            <p className="text-xs text-muted">
              Com a apuração do 2º turno em andamento, o % pode mudar conforme chegam as urnas; a variação em votos
              aparece quando 100% das seções estiverem apuradas.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
