"use client";
// Rankings 1º × 2º turno: onde Lula e Flávio mais cresceram e onde cresceram menos / caíram,
// em p.p. dos válidos ou em votos, e os lugares onde a liderança trocou de lado.
import Link from "next/link";
import { useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { fmtInt, fmtPct } from "@/lib/format";
import type { LinhaTurnos } from "@/lib/turnos";
import type { BlocoId } from "@/lib/types";
import { Card, DeltaPP, Segmentado, SectionTitle, SkeletonLinhas, corTextoBloco } from "../ui";
import { DeltaVotos, apuracaoCompleta } from "./ComparacaoTurnos";

type Medida = "pp" | "votos";

function valor(l: LinhaTurnos, b: BlocoId, m: Medida): number | null {
  const d = b === "pt" ? l.pt : l.bo;
  return m === "pp" ? d.dpp : d.dv;
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

function Lista({
  titulo,
  itens,
  b,
  m,
  vazio,
}: {
  titulo: string;
  itens: LinhaTurnos[];
  b: BlocoId;
  m: Medida;
  vazio: string;
}) {
  return (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold" style={{ color: corTextoBloco(b) }}>
        {titulo}
      </h4>
      {itens.length === 0 ? (
        <p className="text-xs text-muted">{vazio}</p>
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
                  <span className="text-muted" title="1º turno → 2º turno (% dos válidos)">
                    {fmtPct(d.p1, 1)} → {fmtPct(d.p2, 1)}
                  </span>
                  {m === "pp" ? (
                    <DeltaPP v={d.dpp} semSufixo className="w-14 text-right" />
                  ) : (
                    <span className="w-20 text-right">
                      <DeltaVotos v={d.dv} completo />
                    </span>
                  )}
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
  minApurado = 0,
  n = 10,
  titulo = "Quem cresceu e quem caiu",
}: {
  titulo?: string;
  linhas: LinhaTurnos[];
  /** "estados", "municípios"... */
  plural: string;
  carregando?: boolean;
  /** % mínimo apurado no 2º turno para entrar no ranking (evita parciais muito pequenas) */
  minApurado?: number;
  n?: number;
}) {
  const [m, setM] = useState<Medida>("pp");

  const r = useMemo(() => {
    const comDados = linhas.filter((l) => l.t1 && l.t2 && (l.t2.pa ?? 0) >= minApurado);
    const base = m === "votos" ? comDados.filter(apuracaoCompleta) : comDados;
    const ordenar = (b: BlocoId, dir: 1 | -1) =>
      base
        .filter((l) => valor(l, b, m) != null)
        .sort((x, y) => dir * ((valor(y, b, m) ?? 0) - (valor(x, b, m) ?? 0)) || y.peso - x.peso)
        .slice(0, n);
    const conta = (b: BlocoId) => {
      let sobe = 0;
      let desce = 0;
      for (const l of base) {
        const v = valor(l, b, m);
        if (v == null) continue;
        if (v > 0) sobe++;
        else if (v < 0) desce++;
      }
      return { sobe, desce };
    };
    const viradas = comDados.filter((l) => l.virou).sort((x, y) => y.peso - x.peso);
    return {
      total: base.length,
      ptMais: ordenar("pt", 1),
      ptMenos: ordenar("pt", -1),
      boMais: ordenar("bolso", 1),
      boMenos: ordenar("bolso", -1),
      contaPt: conta("pt"),
      contaBo: conta("bolso"),
      viradas,
    };
  }, [linhas, m, minApurado, n]);

  const unidade = m === "pp" ? "p.p. dos válidos" : "votos";
  const resumoBloco = (b: BlocoId, c: { sobe: number; desce: number }) => (
    <p className="text-sm">
      <span className="font-semibold" style={{ color: corTextoBloco(b) }}>
        {BLOCOS[b].nomes["2026"]}
      </span>{" "}
      cresceu em <strong>{fmtInt(c.sobe)}</strong> e caiu em <strong>{fmtInt(c.desce)}</strong> de {fmtInt(r.total)}{" "}
      {plural} ({unidade})
    </p>
  );

  return (
    <Card className="p-4">
      <SectionTitle
        sub={`Onde cada candidato mais cresceu e onde cresceu menos ou caiu do 1º para o 2º turno de 2026${
          minApurado > 0 ? ` (só ${plural} com ao menos ${minApurado}% apurado no 2º turno)` : ""
        }`}
        right={
          <Segmentado<Medida>
            rotulo="Medida"
            valor={m}
            onChange={setM}
            opcoes={[
              { valor: "pp", rotulo: "Em p.p." },
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
          {m === "votos"
            ? `A comparação em votos aparece para ${plural} com 100% das seções do 2º turno apuradas.`
            : `Disponível quando a apuração do 2º turno começar (a partir das 17h).`}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            {resumoBloco("pt", r.contaPt)}
            {resumoBloco("bolso", r.contaBo)}
            {m === "pp" && (
              <p className="text-xs text-muted">
                Em % dos válidos os dois tendem a subir quase em todo lugar, pois herdam os votos dos candidatos
                eliminados no 1º turno; o ranking mostra onde cada um herdou mais (ou menos).
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <Lista titulo="Lula: onde mais cresceu" itens={r.ptMais} b="pt" m={m} vazio="—" />
            <Lista titulo="Lula: onde menos cresceu / caiu" itens={r.ptMenos} b="pt" m={m} vazio="—" />
            <Lista titulo="Flávio: onde mais cresceu" itens={r.boMais} b="bolso" m={m} vazio="—" />
            <Lista titulo="Flávio: onde menos cresceu / caiu" itens={r.boMenos} b="bolso" m={m} vazio="—" />
          </div>
          <div>
            <h4 className="mb-1.5 text-sm font-semibold text-strong">
              Liderança trocou de lado ({fmtInt(r.viradas.length)})
            </h4>
            {r.viradas.length === 0 ? (
              <p className="text-xs text-muted">Nenhum dos {plural} mudou de líder entre o 1º e o 2º turno até agora.</p>
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
            {r.viradas.length > 0 && (
              <p className="mt-1 text-xs text-muted">A cor indica quem passou à frente no 2º turno.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
