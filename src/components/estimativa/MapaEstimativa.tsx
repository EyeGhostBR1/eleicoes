"use client";
// Mapa por estado colorido pela vantagem ESTIMADA no fim da apuração (cenário base 2022),
// com resumo de quantos estados cada um lidera e as "viradas" previstas (líder do parcial ≠ líder estimado).
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { ChoroplethMap } from "@/components/map/ChoroplethMap";
import { Legend } from "@/components/map/Legend";
import { marginColor } from "@/components/map/colors";
import { BLOCOS, UFS } from "@/lib/config";
import { fmtPct } from "@/lib/format";
import type { BlocoId, EstimativaLugar } from "@/lib/types";
import { Card, Dot, corTextoBloco } from "../ui";
import { NOME_26, dif, nomeLugar, textoMargem } from "./util";

function Tooltip({ l, uf }: { l: EstimativaLugar | undefined; uf: string }) {
  if (!l) return <span className="text-xs">{nomeLugar(uf)}: sem dados</span>;
  const e = l.cenarios.base2022;
  const linha = (b: BlocoId) => (
    <tr>
      <th scope="row" className="pr-2 text-left font-medium" style={{ color: corTextoBloco(b) }}>
        {NOME_26[b]}
      </th>
      <td className="px-1 text-right font-semibold">{fmtPct(e[b].pct, 1)}</td>
      <td className="px-1 text-right opacity-80">{fmtPct(l.parcial[b], 1)}</td>
      <td className="px-1 text-right opacity-80">{fmtPct(l.final2022[b], 1)}</td>
    </tr>
  );
  return (
    <div className="min-w-[12rem] text-xs">
      <p className="text-sm font-semibold">{nomeLugar(uf)}</p>
      <p className="opacity-80">{fmtPct(l.pctTotalizado, 1)} apurado</p>
      <p className="mt-1">
        Vantagem estimada: <span className="font-semibold">{textoMargem(dif(e.pt.pct, e.bolso.pct), "2026")}</span>
      </p>
      <table className="mt-1 w-full">
        <thead>
          <tr className="opacity-70">
            <th />
            <th className="px-1 text-right font-normal">Estim.</th>
            <th className="px-1 text-right font-normal">Parcial</th>
            <th className="px-1 text-right font-normal">2022</th>
          </tr>
        </thead>
        <tbody>
          {linha("pt")}
          {linha("bolso")}
        </tbody>
      </table>
    </div>
  );
}

function lider(pt: number | null | undefined, bo: number | null | undefined): BlocoId | null {
  if (pt == null || bo == null || Math.abs(pt - bo) < 0.005) return null;
  return pt > bo ? "pt" : "bolso";
}

export default function MapaEstimativa({ ufs, qs }: { ufs: Record<string, EstimativaLugar>; qs: string }) {
  const router = useRouter();
  const getFill = useCallback(
    (id: string) => {
      const l = ufs[id.toLowerCase()];
      const e = l?.cenarios.base2022;
      return marginColor(e?.pt.pct ?? null, e?.bolso.pct ?? null);
    },
    [ufs],
  );
  const getTooltip = useCallback((id: string) => <Tooltip l={ufs[id.toLowerCase()]} uf={id.toLowerCase()} />, [ufs]);
  const getLabel = useCallback((id: string) => nomeLugar(id.toLowerCase()), []);
  const select = useCallback((id: string) => router.push(`/estado/${id.toLowerCase()}${qs}`), [router, qs]);

  const resumo = useMemo(() => {
    const cont: Record<BlocoId, number> = { pt: 0, bolso: 0 };
    const viradas: { uf: string; de: BlocoId; para: BlocoId }[] = [];
    for (const u of UFS) {
      if (u.sigla === "zz") continue;
      const l = ufs[u.sigla];
      if (!l) continue;
      const e = l.cenarios.base2022;
      const le = lider(e.pt.pct, e.bolso.pct);
      if (le) cont[le]++;
      const lp = l.pctTotalizado > 0 ? lider(l.parcial.pt, l.parcial.bolso) : null;
      if (le && lp && le !== lp) viradas.push({ uf: u.sigla, de: lp, para: le });
    }
    return { cont, viradas };
  }, [ufs]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card className="space-y-3 p-3 sm:p-4">
        <ChoroplethMap
          src="/geo/uf.json"
          objectName="uf"
          idProp="uf"
          getFill={getFill}
          getTooltip={getTooltip}
          getLabel={getLabel}
          onSelect={select}
          ariaLabel="Mapa do Brasil por estado colorido pela vantagem estimada no fim da apuração"
          className="w-full"
        />
        <Legend kind="margin" title="Vantagem estimada" />
      </Card>
      <Card className="p-4">
        <h3 className="text-base font-semibold text-strong">Quem terminaria na frente</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {(["pt", "bolso"] as BlocoId[]).map((b) => (
            <li key={b} className="flex items-center gap-2">
              <Dot cor={BLOCOS[b].cor} />
              <span className="font-semibold" style={{ color: corTextoBloco(b) }}>
                {NOME_26[b]}
              </span>
              <span className="text-muted">
                à frente em <span className="font-semibold text-fg">{resumo.cont[b]}</span>{" "}
                {resumo.cont[b] === 1 ? "estado" : "estados"} (estimativa)
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold text-strong">Viradas previstas</h3>
        {resumo.viradas.length ? (
          <>
            <p className="text-xs text-muted">Estados onde quem lidera o parcial não é quem lidera a estimativa final.</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {resumo.viradas.map((v) => (
                <li key={v.uf}>
                  <button
                    type="button"
                    onClick={() => select(v.uf)}
                    className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg hover:bg-surface"
                    title={`${nomeLugar(v.uf)}: ${NOME_26[v.de]} lidera o parcial, ${NOME_26[v.para]} lidera a estimativa`}
                  >
                    {v.uf.toUpperCase()}: {NOME_26[v.de]} → <span style={{ color: corTextoBloco(v.para) }}>{NOME_26[v.para]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted">Nenhuma: em todos os estados, quem lidera o parcial também lidera a estimativa.</p>
        )}
        <p className="mt-4 text-xs text-muted">
          O Exterior não aparece no mapa, mas entra no total do Brasil e na tabela abaixo. Clique num estado para ver a
          apuração por município.
        </p>
      </Card>
    </div>
  );
}
