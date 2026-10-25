"use client";
// Mapa coroplético com seletor de métrica (margem / variações vs 2022 e 2018).
import { useCallback, useMemo, useState } from "react";
import { ChoroplethMap } from "@/components/map/ChoroplethMap";
import { Legend } from "@/components/map/Legend";
import { fmtInt, fmtPP, fmtPct } from "@/lib/format";
import { Crescimento } from "./turnos/ComparacaoTurnos";
import { BLOCOS } from "@/lib/config";
import {
  METRICAS,
  METRICA_POR_ID,
  type Metrica,
  type MetricaId,
  type ValoresLugar,
  corMetrica,
  legendaMetrica,
  valorMetrica,
} from "./metricas";
import { cx } from "./ui";

export interface DadosMapa extends ValoresLugar {
  nome: string;
  /** % apurado (2026) */
  pa: number | null;
}

export function TooltipMapa({ d, metrica }: { d: DadosMapa | undefined; metrica: MetricaId }) {
  if (!d) return <span className="text-xs">Sem dados</span>;
  const v = valorMetrica(metrica, d);
  const linha = (
    rot: string,
    cor: string,
    a: number | null,
    b: number | null,
    c: number | null,
    nomes: [string, string, string],
  ) => (
    <tr>
      <th scope="row" className="pr-2 text-left font-medium" style={{ color: cor }}>
        {rot}
      </th>
      <td className="px-1 text-right" title={nomes[0]}>
        {fmtPct(a, 1)}
      </td>

      <td className="px-1 text-right opacity-80" title={nomes[1]}>
        {fmtPct(b, 1)}
      </td>
      <td className="px-1 text-right opacity-80" title={nomes[2]}>
        {fmtPct(c, 1)}
      </td>
    </tr>
  );
  return (
    <div className="min-w-[11rem] text-xs">
      <p className="text-sm font-semibold">{d.nome}</p>
      {d.pa != null && <p className="opacity-80">{fmtPct(d.pa, 1)} apurado</p>}
      <p className="mt-1">
        {METRICA_POR_ID[metrica].rotulo}: <span className="font-semibold">{fmtPP(v)}</span>
      </p>
      <table className="mt-1 w-full">
        <thead>
          <tr className="opacity-70">
            <th />
            <th className="px-1 text-right font-normal">2026</th>
            <th className="px-1 text-right font-normal">2022</th>
            <th className="px-1 text-right font-normal">2018</th>
          </tr>
        </thead>
        <tbody>
          {linha("Lula", BLOCOS.pt.cor, d.pt26, d.pt22, d.pt18, ["Lula", "Lula", "Haddad"])}
          {linha("Flávio", BLOCOS.bolso.cor, d.bo26, d.bo22, d.bo18, ["Flávio", "Jair", "Jair"])}
        </tbody>
      </table>
      {d.vt && (
        <div className="mt-1.5 border-t border-line pt-1.5">
          <p className="opacity-70">Votos 1º → 2º turno de 2026</p>
          {(
            [
              ["Lula", BLOCOS.pt.cor, d.vt.pt1, d.vt.pt2, d.gpt],
              ["Flávio", BLOCOS.bolso.cor, d.vt.bo1, d.vt.bo2, d.gbo],
            ] as const
          ).map(([nome, cor, a, b, g]) => (
            <p key={nome} className="flex justify-between gap-3">
              <span className="font-medium" style={{ color: cor }}>
                {nome}
              </span>
              <span className="tabular-nums">
                {fmtInt(a)} → {fmtInt(b)} {g != null ? <Crescimento v={g} /> : <span className="opacity-70">(apurando)</span>}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Botões de escolha da métrica do mapa. */
export function SeletorMetrica({
  metrica,
  onChange,
  disponivel,
  temTurnos,
}: {
  metrica: MetricaId;
  onChange: (m: MetricaId) => void;
  disponivel: (m: Metrica) => boolean;
  temTurnos: boolean;
}) {
  return (
    <div role="group" aria-label="Métrica do mapa" className="flex flex-wrap gap-1.5">
      {METRICAS.filter((mt) => temTurnos || !mt.turnos).map((mt) => {
        const desab = !disponivel(mt);
        const ativo = mt.id === metrica;
        return (
          <button
            key={mt.id}
            type="button"
            aria-pressed={ativo}
            disabled={desab}
            title={desab ? "Disponível quando a apuração de 2026 começar" : mt.explicacao}
            onClick={() => onChange(mt.id)}
            className={cx(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              ativo ? "border-strong bg-strong text-surface" : "border-line bg-surface text-fg hover:bg-surface-2",
              desab && "cursor-not-allowed opacity-40 hover:bg-surface",
            )}
          >
            {mt.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** Métrica efetiva: a escolhida, se disponível; senão a padrão (margem 2026 ou 2022). */
export function useMetrica(temLive: boolean, temTurnos: boolean) {
  const [escolha, setEscolha] = useState<MetricaId | null>(null);
  const padrao: MetricaId = temLive ? "margem26" : "margem22";
  const disponivel = useCallback(
    (mt: Metrica) => (temLive || !mt.live) && (temTurnos || !mt.turnos),
    [temLive, temTurnos],
  );
  const metrica: MetricaId = escolha && disponivel(METRICA_POR_ID[escolha]) ? escolha : padrao;
  return { metrica, setEscolha, disponivel };
}

export default function MapaMetricas({
  src,
  objectName,
  idProp,
  ariaLabel,
  temLive,
  temTurnos = false,
  dados,
  onSelect,
  aspect,
  className,
}: {
  src: string;
  objectName: "uf" | "mun";
  idProp: "uf" | "ibge";
  ariaLabel: string;
  temLive: boolean;
  /** 2º turno com o 1º turno disponível → mostra as métricas de variação entre turnos */
  temTurnos?: boolean;
  /** dados por id do mapa (UF minúscula ou código IBGE) */
  dados: Map<string, DadosMapa>;
  onSelect?: (id: string) => void;
  aspect?: number;
  className?: string;
}) {
  const { metrica, setEscolha, disponivel } = useMetrica(temLive, temTurnos);
  const m = METRICA_POR_ID[metrica];

  const chave = useCallback((id: string | number) => String(id).toLowerCase(), []);
  const getFill = useCallback((id: string) => corMetrica(metrica, dados.get(chave(id))), [metrica, dados, chave]);
  const getTooltip = useCallback(
    (id: string) => <TooltipMapa d={dados.get(chave(id))} metrica={metrica} />,
    [dados, metrica, chave],
  );
  const select = useCallback((id: string) => onSelect?.(chave(id)), [onSelect, chave]);
  const getLabel = useCallback((id: string) => dados.get(chave(id))?.nome ?? String(id), [dados, chave]);
  const legenda = useMemo(() => legendaMetrica(metrica), [metrica]);

  return (
    <div className={cx("space-y-3", className)}>
      <SeletorMetrica metrica={metrica} onChange={setEscolha} disponivel={disponivel} temTurnos={temTurnos} />
      <ChoroplethMap
        src={src}
        objectName={objectName}
        idProp={idProp}
        getFill={getFill}
        getTooltip={getTooltip}
        onSelect={onSelect ? select : undefined}
        getLabel={getLabel}
        ariaLabel={`${ariaLabel} — ${m.rotulo}`}
        aspect={aspect}
        className="w-full"
      />
      <div className="space-y-1">
        <Legend data={legenda} />
        <p className="text-xs text-muted">{m.explicacao}</p>
      </div>
    </div>
  );
}
