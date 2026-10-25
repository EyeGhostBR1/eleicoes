"use client";
// "Comparação justa": 2026 (boletins recebidos) × 2022 × 2018 somando, nos três anos,
// apenas as MESMAS cidades — as que já têm boletins em 2026.
import { useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { margem } from "@/lib/compare";
import { fmtInt, fmtPP, fmtPct } from "@/lib/format";
import type { BlocoId, ExteriorResponse, HistMunFile, Turno } from "@/lib/types";
import { Card, DeltaPP, Segmentado, SectionTitle, cx } from "../ui";
import { type ConjuntoComparacao, type Criterio, conjuntoComparacao } from "./dados";

type Ano = "2026" | "2022" | "2018";

function nomeCurto(b: BlocoId, ano: Ano): string {
  return BLOCOS[b].nomes[ano].replace(" Bolsonaro", "");
}

function TextoMargem({ m, ano }: { m: number | null; ano: Ano }) {
  if (m == null) return <span className="text-muted">—</span>;
  if (Math.abs(m) < 0.05) return <span className="text-muted">empate</span>;
  const b: BlocoId = m > 0 ? "pt" : "bolso";
  return (
    <span className="whitespace-nowrap font-medium" style={{ color: b === "pt" ? "var(--c-pt)" : "var(--c-bolso)" }}>
      {nomeCurto(b, ano)} +{fmtPP(Math.abs(m)).replace(/^[+±−]/, "").replace(" p.p.", "")}
    </span>
  );
}

function Tabela({ c }: { c: ConjuntoComparacao }) {
  const linhas: { ano: Ano; rotulo: string; pt: number | null; bo: number | null; dpt: number | null; dbo: number | null }[] = [
    { ano: "2026", rotulo: "2026 (boletins)", pt: c.pt.p2026, bo: c.bo.p2026, dpt: null, dbo: null },
    { ano: "2022", rotulo: "2022 (final)", pt: c.pt.p2022, bo: c.bo.p2022, dpt: c.pt.d22, dbo: c.bo.d22 },
    { ano: "2018", rotulo: "2018 (final)", pt: c.pt.p2018, bo: c.bo.p2018, dpt: c.pt.d18, dbo: c.bo.d18 },
  ];
  return (
    <div className="tabela-scroll -mx-1">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="sr-only">
          Lula/Haddad e Flávio/Jair nas mesmas cidades em 2026, 2022 e 2018; Δ = 2026 menos o ano da linha
        </caption>
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="px-1 py-1.5 text-left font-medium">
              Ano
            </th>
            <th scope="col" className="px-1 py-1.5 text-right font-medium" style={{ color: "var(--c-pt)" }}>
              Lula / Haddad
            </th>
            <th scope="col" className="px-1 py-1.5 text-right font-medium" style={{ color: "var(--c-bolso)" }}>
              Flávio / Jair
            </th>
            <th scope="col" className="px-1 py-1.5 text-right font-medium">
              Vantagem
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((l) => (
            <tr key={l.ano} className={cx(l.ano === "2026" && "font-semibold")}>
              <th scope="row" className="whitespace-nowrap px-1 py-2 text-left font-medium text-fg">
                {l.rotulo}
              </th>
              <td className="whitespace-nowrap px-1 py-2 text-right">
                <span className="font-semibold" style={{ color: "var(--c-pt)" }} title={`${nomeCurto("pt", l.ano)} ${l.ano}`}>
                  {fmtPct(l.pt, 1)}
                </span>
                {l.ano !== "2026" && (
                  <span className="ml-1.5 text-xs" title={`Lula 2026 − ${nomeCurto("pt", l.ano)} ${l.ano}`}>
                    <DeltaPP v={l.dpt} semSufixo />
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-1 py-2 text-right">
                <span className="font-semibold" style={{ color: "var(--c-bolso)" }} title={`${nomeCurto("bolso", l.ano)} ${l.ano}`}>
                  {fmtPct(l.bo, 1)}
                </span>
                {l.ano !== "2026" && (
                  <span className="ml-1.5 text-xs" title={`Flávio 2026 − Jair ${l.ano}`}>
                    <DeltaPP v={l.dbo} semSufixo />
                  </span>
                )}
              </td>
              <td className="px-1 py-2 text-right text-xs">
                <TextoMargem m={margem(l.pt, l.bo)} ano={l.ano} />
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="px-1 py-2 text-left text-xs font-medium text-muted">
              Comparecimento
            </th>
            <td colSpan={3} className="px-1 py-2 text-right text-xs text-muted">
              2026 <span className="font-medium text-fg">{fmtPct(c.comp26, 1)}</span> · 2022{" "}
              <span className="font-medium text-fg">{fmtPct(c.comp22, 1)}</span> · 2018{" "}
              <span className="font-medium text-fg">{fmtPct(c.comp18, 1)}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Resumo de uma linha do outro critério, para ver os dois de relance. */
function OutroConjunto({ c, onVer }: { c: ConjuntoComparacao | null; onVer: (v: Criterio) => void }) {
  if (!c || c.ag.validos <= 0) return null;
  const rotulo = c.criterio === "completas" ? "Só cidades completas" : "Todas com boletins";
  return (
    <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
      <button type="button" onClick={() => onVer(c.criterio)} className="font-medium text-fg underline underline-offset-2">
        {rotulo}
      </button>{" "}
      ({fmtInt(c.cidades.length)} cidades) — vs 2022: Lula <DeltaPP v={c.pt.d22} /> · Flávio vs Jair <DeltaPP v={c.bo.d22} />
    </p>
  );
}

export default function ComparacaoJusta({
  ext,
  histZz,
  turno,
  carregandoHist,
}: {
  ext: ExteriorResponse;
  histZz: HistMunFile | undefined;
  turno: Turno;
  carregandoHist?: boolean;
}) {
  const completas = useMemo(() => conjuntoComparacao(ext, histZz, turno, "completas"), [ext, histZz, turno]);
  const recebidas = useMemo(() => conjuntoComparacao(ext, histZz, turno, "recebidas"), [ext, histZz, turno]);
  const [escolha, setEscolha] = useState<Criterio | null>(null);
  // padrão: cidades completas, se já houver alguma com votos
  const criterio: Criterio = escolha ?? ((completas?.ag.validos ?? 0) > 0 ? "completas" : "recebidas");
  const c = criterio === "completas" ? completas : recebidas;

  return (
    <Card className="p-4 sm:p-5" aria-labelledby="comp-justa">
      <SectionTitle
        id="comp-justa"
        sub="2022 e 2018 somados só nas cidades que já têm boletins em 2026 — a comparação que importa durante o recebimento."
      >
        Comparação nas mesmas cidades
      </SectionTitle>
      <div className="mb-3 overflow-x-auto">
        <Segmentado<Criterio>
          rotulo="Cidades consideradas"
          tamanho="xs"
          valor={criterio}
          onChange={setEscolha}
          opcoes={[
            {
              valor: "completas",
              rotulo: `Cidades completas (${fmtInt(completas?.cidades.length ?? 0)})`,
              titulo: "Só cidades com 100% das seções recebidas",
            },
            {
              valor: "recebidas",
              rotulo: `Todas com boletins (${fmtInt(recebidas?.cidades.length ?? 0)})`,
              titulo: "Cidades com ao menos uma seção recebida",
            },
          ]}
        />
      </div>
      {carregandoHist && !histZz ? (
        <p className="text-sm text-muted">Carregando histórico de 2022 e 2018…</p>
      ) : !c || c.ag.validos <= 0 ? (
        <p className="text-sm text-muted">
          {criterio === "completas"
            ? "Nenhuma cidade com todas as seções recebidas ainda. Veja “Todas com boletins”."
            : "Ainda não há votos válidos em cidades com histórico de 2022 e 2018."}
        </p>
      ) : (
        <>
          <Tabela c={c} />
          <p className="mt-2 text-xs text-muted">
            {fmtInt(c.cidades.length)} {c.cidades.length === 1 ? "cidade" : "cidades"} em {fmtInt(c.paises)}{" "}
            {c.paises === 1 ? "país" : "países"} · {fmtInt(c.ag.secoesRecebidas)} seções · {fmtInt(c.ag.validos)} votos
            válidos em 2026.
            {criterio === "recebidas" &&
              " Cidades com recebimento parcial entram com as seções já recebidas e, em 2022/2018, com peso proporcional (seções recebidas ÷ total)."}
            {c.excluidas > 0 &&
              ` ${fmtInt(c.excluidas)} ${c.excluidas === 1 ? "cidade sem histórico" : "cidades sem histórico"} em 2022/2018 ${c.excluidas === 1 ? "ficou" : "ficaram"} de fora.`}
          </p>
        </>
      )}
      <OutroConjunto c={criterio === "completas" ? recebidas : completas} onVer={setEscolha} />
    </Card>
  );
}
