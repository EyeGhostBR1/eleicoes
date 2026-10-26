"use client";
// Campo "1º turno × 2º turno" de um lugar (separado das comparações com 2022/2018).
//
// A medida principal é o crescimento em VOTOS de cada candidato em relação aos próprios votos do
// 1º turno (absoluto e em %). O % dos válidos aparece só como contexto: com dois candidatos no
// 2º turno, ele sobe para ambos só porque os outros candidatos saíram.
// Os votos só são comparados com a apuração do 2º turno concluída no lugar.
import type { ReactNode } from "react";
import { BLOCOS } from "@/lib/config";
import { deltaPP } from "@/lib/compare";
import { fmtInt, fmtPct } from "@/lib/format";
import { type DeltaTurno, type LinhaTurnos, pctComparecimento } from "@/lib/turnos";
import type { BlocoId } from "@/lib/types";
import { Card, DeltaPP, Dot, SectionTitle, SkeletonLinhas, corTextoBloco, cx } from "../ui";

/** Δ votos com sinal e cor (null → "—"). */
export function DeltaVotos({ v, className }: { v: number | null; className?: string }) {
  if (v == null) return <span className={cx("text-muted", className)}>—</span>;
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "±";
  return (
    <span className={cx(v > 0 ? "font-semibold text-up" : v < 0 ? "font-semibold text-down" : "text-muted", className)}>
      {sinal}
      {fmtInt(Math.abs(v))}
    </span>
  );
}

/** Crescimento % dos votos com sinal e cor (null → "—"). */
export function Crescimento({ v, className }: { v: number | null; className?: string }) {
  if (v == null || !isFinite(v)) return <span className={cx("text-muted", className)}>—</span>;
  const r = Math.round(v * 10) / 10 || 0;
  const sinal = r > 0 ? "+" : r < 0 ? "−" : "±";
  return (
    <span className={cx(r > 0 ? "font-semibold text-up" : r < 0 ? "font-semibold text-down" : "text-muted", className)}>
      {sinal}
      {fmtPct(Math.abs(r), 1)}
    </span>
  );
}

/** Texto-resumo em votos (só com a apuração do 2º turno concluída). */
export function frase(l: LinhaTurnos): string | null {
  if (l.pt.dv == null || l.bo.dv == null) return null;
  const um = (nome: string, d: DeltaTurno) => {
    const dv = d.dv ?? 0;
    const verbo = dv >= 0 ? "ganhou" : "perdeu";
    const pc = d.cresc != null ? ` (${dv >= 0 ? "+" : "−"}${fmtPct(Math.abs(d.cresc), 1)})` : "";
    return `${nome} ${verbo} ${fmtInt(Math.abs(dv))} votos${pc}`;
  };
  const partes = [`${um("Lula", l.pt)} e ${um("Flávio", l.bo)} em relação ao 1º turno`];
  const diff = l.pt.dv - l.bo.dv;
  if (diff !== 0) partes.push(`${diff > 0 ? "Lula" : "Flávio"} ganhou ${fmtInt(Math.abs(diff))} votos a mais que o adversário`);
  if (l.virou) partes.push(`a liderança mudou: ${l.lider2 === "pt" ? "Lula" : "Flávio"} passou à frente`);
  return partes.join("; ") + ".";
}

function CartaoCandidato({ b, d, completo, pa }: { b: BlocoId; d: DeltaTurno; completo: boolean; pa: number | null }) {
  const cor = BLOCOS[b].cor;
  const nome = BLOCOS[b].nomes["2026"];
  const max = Math.max(d.v1 ?? 0, d.v2 ?? 0, 1);
  return (
    <article
      className="relative overflow-hidden rounded-xl border border-line bg-surface p-4"
      aria-label={`${nome}: ${fmtInt(d.v1)} votos no 1º turno e ${fmtInt(d.v2)} votos no 2º turno`}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />
      <h3 className="flex items-center gap-2 text-base font-semibold" style={{ color: corTextoBloco(b) }}>
        <Dot cor={cor} />
        {nome}
      </h3>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">1º turno · 04/10</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight text-fg sm:text-3xl">{fmtInt(d.v1)}</p>
          <p className="text-xs text-muted">votos · {fmtPct(d.p1, 2)} dos válidos</p>
        </div>
        <span aria-hidden className="pb-5 text-xl text-muted">
          →
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">2º turno · 25/10</p>
          <p className="text-2xl font-bold tabular-nums leading-tight sm:text-3xl" style={{ color: corTextoBloco(b) }}>
            {fmtInt(d.v2)}
          </p>
          <p className="text-xs text-muted">
            votos · {fmtPct(d.p2, 2)} dos válidos
            {!completo && " (parcial)"}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1" aria-hidden>
        {[
          { r: "1º T", v: d.v1, o: 0.45 },
          { r: "2º T", v: d.v2, o: 1 },
        ].map((x) => (
          <div key={x.r} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-[11px] text-muted">{x.r}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${((x.v ?? 0) / max) * 100}%`, background: cor, opacity: x.o }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {completo ? (
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted">Votos a mais / a menos</dt>
              <dd className="text-lg tabular-nums">
                <DeltaVotos v={d.dv} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Crescimento dos votos</dt>
              <dd className="text-lg">
                <Crescimento v={d.cresc} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted">
            Crescimento em votos: aguardando 100% da apuração do 2º turno ({fmtPct(pa ?? 0, 1)} apurado).
          </p>
        )}
      </div>
    </article>
  );
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
  const completo = !!linha?.completo;
  const comp1 = pctComparecimento(linha?.t1 ?? null);
  const comp2 = pctComparecimento(linha?.t2 ?? null);
  const votosOutros1 = linha?.t1 ? linha.t1.vv - linha.t1.vpt - linha.t1.vbo : null;
  const resumo = linha ? frase(linha) : null;
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle sub={`${nomeLugar} · votos de cada candidato no 1º e no 2º turno de 2026`}>1º turno × 2º turno</SectionTitle>
      {carregando && !linha ? (
        <SkeletonLinhas n={4} />
      ) : !linha?.t1 ? (
        <p className="text-sm text-muted">Resultado do 1º turno indisponível no momento.</p>
      ) : (
        <div className="space-y-3">
          {nota && <p className="text-xs text-muted">{nota}</p>}
          {sem2 && (
            <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
              Ainda não há resultados do 2º turno aqui; os números aparecem assim que a apuração começar.
            </p>
          )}
          {resumo && <p className="text-sm font-medium text-fg">{resumo}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CartaoCandidato b="pt" d={linha.pt} completo={completo} pa={linha.t2?.pa ?? null} />
            <CartaoCandidato b="bolso" d={linha.bo} completo={completo} pa={linha.t2?.pa ?? null} />
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-surface-2/60 px-3 py-2.5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Votos de outros candidatos no 1º turno</dt>
              <dd className="font-medium tabular-nums">{fmtInt(votosOutros1)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Comparecimento 1º → 2º turno</dt>
              <dd className="font-medium">
                {fmtInt(linha.t1?.comp)} → {fmtInt(linha.t2?.comp)}{" "}
                <span className="text-xs text-muted">
                  ({fmtPct(comp1, 1)} → {fmtPct(comp2, 1)})
                </span>{" "}
                {completo && comp1 != null && comp2 != null && <DeltaPP v={deltaPP(comp2, comp1)} semSufixo className="text-xs" />}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Apurado no 2º turno</dt>
              <dd className="font-medium">{fmtPct(linha.t2?.pa ?? 0, 2)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">
            O crescimento compara os votos de cada candidato com os próprios votos dele no 1º turno. O % dos válidos é só
            referência: com dois candidatos, ele sobe para ambos porque os outros candidatos saíram da disputa.
          </p>
        </div>
      )}
    </Card>
  );
}
