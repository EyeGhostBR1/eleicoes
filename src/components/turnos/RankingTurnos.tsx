"use client";
// Rankings 1º × 2º turno: onde Lula e Flávio mais ganharam e onde perderam votos em relação aos
// próprios votos do 1º turno (em % ou em número de votos), e onde a liderança trocou de lado.
// Só entram lugares com o 2º turno 100% apurado (antes disso os votos não são comparáveis).
import Link from "next/link";
import { useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { fmtInt } from "@/lib/format";
import type { LinhaTurnos } from "@/lib/turnos";
import type { BlocoId } from "@/lib/types";
import { Card, Segmentado, SectionTitle, SkeletonLinhas, corTextoBloco } from "../ui";
import { Crescimento, DeltaVotos } from "./ComparacaoTurnos";

type Medida = "cresc" | "votos";

function valor(l: LinhaTurnos, b: BlocoId, m: Medida): number | null {
  const d = b === "pt" ? l.pt : l.bo;
  return m === "cresc" ? d.cresc : d.dv;
}

function Nome({ l }: { l: LinhaTurnos }) {
  const txt = (
    <>
      {l.nome}
      {l.sub && <span className="ml-1 text-xs text-muted">{l.sub}</span>}
    </>
  );
  return l.href ? (
    <Link href={l.href} className="hover:underline">
      {txt}
    </Link>
  ) : (
    txt
  );
}

function Lista({ titulo, itens, b, m }: { titulo: string; itens: LinhaTurnos[]; b: BlocoId; m: Medida }) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold" style={{ color: corTextoBloco(b) }}>
        {titulo}
      </h4>
      {itens.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {itens.map((l, i) => {
            const d = b === "pt" ? l.pt : l.bo;
            return (
              <li key={l.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 inline-block w-5 text-right text-xs text-muted">{i + 1}.</span>
                  <Nome l={l} />
                </span>
                <span className="flex shrink-0 items-baseline gap-2 text-xs">
                  <span className="tabular-nums text-muted" title="Votos no 1º turno → votos no 2º turno">
                    {fmtInt(d.v1)} → {fmtInt(d.v2)}
                  </span>
                  <span className="w-[4.5rem] text-right tabular-nums">
                    {m === "cresc" ? <Crescimento v={d.cresc} /> : <DeltaVotos v={d.dv} />}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function RankingTurnos({
  linhas,
  plural,
  carregando,
  n = 10,
  titulo = "Onde cada um ganhou e perdeu votos",
}: {
  linhas: LinhaTurnos[];
  /** "estados", "municípios"... */
  plural: string;
  carregando?: boolean;
  n?: number;
  titulo?: string;
}) {
  const [m, setM] = useState<Medida>("cresc");

  const r = useMemo(() => {
    const comparaveis = linhas.filter((l) => l.t1 && l.t2 && l.completo);
    const emApuracao = linhas.filter((l) => l.t1 && l.t2 && !l.completo).length;
    const ordenar = (b: BlocoId, dir: 1 | -1) =>
      comparaveis
        .filter((l) => valor(l, b, m) != null)
        .sort((x, y) => dir * ((valor(y, b, m) ?? 0) - (valor(x, b, m) ?? 0)) || y.peso - x.peso)
        .slice(0, n);
    const conta = (b: BlocoId) => {
      let ganhou = 0;
      let perdeu = 0;
      for (const l of comparaveis) {
        const v = (b === "pt" ? l.pt : l.bo).dv;
        if (v == null) continue;
        if (v > 0) ganhou++;
        else if (v < 0) perdeu++;
      }
      return { ganhou, perdeu };
    };
    return {
      total: comparaveis.length,
      emApuracao,
      ptMais: ordenar("pt", 1),
      ptMenos: ordenar("pt", -1),
      boMais: ordenar("bolso", 1),
      boMenos: ordenar("bolso", -1),
      contaPt: conta("pt"),
      contaBo: conta("bolso"),
      viradas: comparaveis.filter((l) => l.virou).sort((x, y) => y.peso - x.peso),
    };
  }, [linhas, m, n]);

  const resumoBloco = (b: BlocoId, c: { ganhou: number; perdeu: number }) => (
    <p className="text-sm">
      <span className="font-semibold" style={{ color: corTextoBloco(b) }}>
        {BLOCOS[b].nomes["2026"]}
      </span>{" "}
      ganhou votos em <strong>{fmtInt(c.ganhou)}</strong> e perdeu votos em <strong>{fmtInt(c.perdeu)}</strong> de{" "}
      {fmtInt(r.total)} {plural}
    </p>
  );
  const rotM = m === "cresc" ? "(% dos próprios votos do 1º turno)" : "(votos)";

  return (
    <Card className="p-4">
      <SectionTitle
        sub={`Votos de cada candidato no 2º turno comparados com os votos dele no 1º turno de 2026 · só ${plural} com 100% apurado no 2º turno`}
        right={
          <Segmentado<Medida>
            rotulo="Medida"
            valor={m}
            onChange={setM}
            opcoes={[
              { valor: "cresc", rotulo: "Em %" },
              { valor: "votos", rotulo: "Em votos" },
            ]}
          />
        }
      >
        {titulo}
      </SectionTitle>

      {carregando && r.total === 0 ? (
        <SkeletonLinhas n={6} />
      ) : r.total === 0 ? (
        <p className="text-sm text-muted">
          {r.emApuracao > 0
            ? `Nenhum dos ${plural} terminou a apuração do 2º turno ainda (${fmtInt(r.emApuracao)} em apuração). O ranking aparece conforme cada um chega a 100%.`
            : "Disponível quando a apuração do 2º turno começar."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            {resumoBloco("pt", r.contaPt)}
            {resumoBloco("bolso", r.contaBo)}
            {r.emApuracao > 0 && (
              <p className="text-xs text-muted">
                {fmtInt(r.emApuracao)} {plural} ainda em apuração ficam de fora até chegarem a 100%.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <Lista titulo={`Lula: onde mais ganhou ${rotM}`} itens={r.ptMais} b="pt" m={m} />
            <Lista titulo={`Lula: onde menos ganhou ou perdeu ${rotM}`} itens={r.ptMenos} b="pt" m={m} />
            <Lista titulo={`Flávio: onde mais ganhou ${rotM}`} itens={r.boMais} b="bolso" m={m} />
            <Lista titulo={`Flávio: onde menos ganhou ou perdeu ${rotM}`} itens={r.boMenos} b="bolso" m={m} />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-semibold text-strong">Liderança trocou de lado ({fmtInt(r.viradas.length)})</h4>
            {r.viradas.length === 0 ? (
              <p className="text-xs text-muted">Nenhum dos {plural} mudou de líder entre o 1º e o 2º turno.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5 text-xs">
                {r.viradas.slice(0, 60).map((l) => (
                  <li
                    key={l.id}
                    className="rounded-full border border-line px-2 py-0.5"
                    title={`1º turno: ${l.lider1 === "pt" ? "Lula" : "Flávio"} à frente · 2º turno: ${l.lider2 === "pt" ? "Lula" : "Flávio"} à frente`}
                  >
                    <span style={{ color: corTextoBloco(l.lider2!) }} aria-hidden>
                      ●{" "}
                    </span>
                    <Nome l={l} />
                    <span className="sr-only">: agora {l.lider2 === "pt" ? "Lula" : "Flávio"} à frente</span>
                  </li>
                ))}
                {r.viradas.length > 60 && <li className="px-1 py-0.5 text-muted">e mais {fmtInt(r.viradas.length - 60)}…</li>}
              </ul>
            )}
            {r.viradas.length > 0 && <p className="mt-1 text-xs text-muted">A cor indica quem passou à frente no 2º turno.</p>}
          </div>
        </div>
      )}
    </Card>
  );
}
