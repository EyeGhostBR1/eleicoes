// Linhas e colunas das tabelas do painel 1º × 2º turno.
import { BLOCOS } from "@/lib/config";
import { fmtCompact, fmtInt, fmtPct } from "@/lib/format";
import type { BlocoId, TemposLugar } from "@/lib/types";
import { DeltaVotos } from "../turnos/ComparacaoTurnos";
import { Dot, cx } from "../ui";
import type { ColunaPainel, LinhaBase } from "./TabelaPainel";
import { fmtDiferenca, fmtDuracao, relogio } from "./tempo";

// ---------------------------------------------------------------------------
// Lugares (cidades / municípios): resultado e tempo de apuração nos dois turnos
// ---------------------------------------------------------------------------

export interface LadoTurno {
  /** % dos válidos */
  pt: number | null;
  bo: number | null;
  vpt: number;
  vbo: number;
  /** % apurado */
  pa: number;
  completo: boolean;
  /** minutos após o fechamento em que concluiu (null = não concluiu ou sem horário) */
  m: number | null;
}

export interface LinhaLugarTempo extends LinhaBase {
  eleitorado: number;
  t1: LadoTurno | null;
  t2: LadoTurno | null;
  lider1: BlocoId | null;
  lider2: BlocoId | null;
}

export function lider(l: LadoTurno | null): BlocoId | null {
  if (!l || l.vpt === l.vbo) return null;
  return l.vpt > l.vbo ? "pt" : "bolso";
}

function PctVotos({ p, v, parcial }: { p: number | null; v: number | null; parcial?: boolean }) {
  if (p == null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cx("font-semibold tabular-nums", parcial ? "text-muted" : "text-fg")}>{fmtPct(p, 1)}</span>
      <span className="text-[11px] tabular-nums text-muted">
        {fmtInt(v)}
        {parcial && " · parcial"}
      </span>
    </span>
  );
}

function Conclusao({ lado, fechamento }: { lado: LadoTurno | null; fechamento: string }) {
  if (!lado) return <span className="text-muted">—</span>;
  if (lado.m == null) return <span className="text-xs text-muted">{lado.completo ? "concluído" : "em andamento"}</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold tabular-nums">{fmtDuracao(lado.m)}</span>
      <span className="text-[11px] text-muted">às {relogio(fechamento, lado.m)}</span>
    </span>
  );
}

function NomeLider({ b }: { b: BlocoId | null }) {
  if (!b) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Dot cor={BLOCOS[b].cor} />
      {b === "pt" ? "Lula" : "Flávio"}
    </span>
  );
}

/** Δ de tempo entre as conclusões (min, 2º − 1º); com o 2º em andamento, quanto já passou do tempo do 1º. */
function difTempo(l: LinhaLugarTempo, agoraMin2: number): number | null {
  const m1 = l.t1?.m;
  if (m1 == null) return null;
  const m2 = l.t2?.m;
  if (m2 != null) return m2 - m1;
  return agoraMin2 > m1 ? agoraMin2 - m1 : null;
}

export function colunasLugares(fech1: string, fech2: string, agoraMin2: number): ColunaPainel<LinhaLugarTempo>[] {
  const votos = (l: LinhaLugarTempo, b: BlocoId) => {
    if (!l.t1?.completo || !l.t2?.completo) return null;
    return b === "pt" ? l.t2.vpt - l.t1.vpt : l.t2.vbo - l.t1.vbo;
  };
  return [
    {
      id: "eleit",
      rotulo: "Eleitorado",
      titulo: "Eleitorado apto",
      get: (l) => l.eleitorado,
      render: (l) => <span className="tabular-nums text-muted" title={fmtInt(l.eleitorado)}>{fmtCompact(l.eleitorado)}</span>,
    },
    {
      id: "pt1",
      grupo: "t1",
      rotulo: "Lula",
      titulo: "Lula no 1º turno (% dos válidos e votos)",
      get: (l) => l.t1?.pt ?? null,
      render: (l) => <PctVotos p={l.t1?.pt ?? null} v={l.t1?.vpt ?? null} />,
    },
    {
      id: "bo1",
      grupo: "t1",
      rotulo: "Flávio",
      titulo: "Flávio no 1º turno (% dos válidos e votos)",
      get: (l) => l.t1?.bo ?? null,
      render: (l) => <PctVotos p={l.t1?.bo ?? null} v={l.t1?.vbo ?? null} />,
    },
    {
      id: "m1",
      grupo: "t1",
      rotulo: "Concluído em",
      titulo: "Tempo entre o fechamento das urnas (17h) e a conclusão da apuração no 1º turno",
      get: (l) => l.t1?.m ?? null,
      dir0: "asc",
      render: (l) => <Conclusao lado={l.t1} fechamento={fech1} />,
    },
    {
      id: "pa2",
      grupo: "t2",
      rotulo: "Apurado",
      titulo: "% apurado no 2º turno",
      get: (l) => l.t2?.pa ?? null,
      render: (l) => <span className={cx("tabular-nums", l.t2?.completo ? "text-fg" : "text-muted")}>{l.t2 ? fmtPct(l.t2.pa, 1) : "—"}</span>,
    },
    {
      id: "pt2",
      grupo: "t2",
      rotulo: "Lula",
      titulo: "Lula no 2º turno (% dos válidos e votos)",
      get: (l) => l.t2?.pt ?? null,
      render: (l) => <PctVotos p={l.t2?.pt ?? null} v={l.t2?.vpt ?? null} parcial={!!l.t2 && !l.t2.completo} />,
    },
    {
      id: "bo2",
      grupo: "t2",
      rotulo: "Flávio",
      titulo: "Flávio no 2º turno (% dos válidos e votos)",
      get: (l) => l.t2?.bo ?? null,
      render: (l) => <PctVotos p={l.t2?.bo ?? null} v={l.t2?.vbo ?? null} parcial={!!l.t2 && !l.t2.completo} />,
    },
    {
      id: "m2",
      grupo: "t2",
      rotulo: "Concluído em",
      titulo: "Tempo entre o fechamento das urnas (19h) e a conclusão da apuração no 2º turno",
      get: (l) => l.t2?.m ?? null,
      dir0: "asc",
      render: (l) => <Conclusao lado={l.t2} fechamento={fech2} />,
    },
    {
      id: "dvpt",
      grupo: "cmp",
      rotulo: "Δ votos Lula",
      titulo: "Votos de Lula no 2º turno − no 1º turno (com os dois turnos 100% apurados)",
      get: (l) => votos(l, "pt"),
      render: (l) => (l.t2 && !l.t2.completo ? <span className="text-xs text-muted">apurando</span> : <DeltaVotos v={votos(l, "pt")} />),
    },
    {
      id: "dvbo",
      grupo: "cmp",
      rotulo: "Δ votos Flávio",
      titulo: "Votos de Flávio no 2º turno − no 1º turno (com os dois turnos 100% apurados)",
      get: (l) => votos(l, "bolso"),
      render: (l) => (l.t2 && !l.t2.completo ? <span className="text-xs text-muted">apurando</span> : <DeltaVotos v={votos(l, "bolso")} />),
    },
    {
      id: "dtempo",
      grupo: "cmp",
      rotulo: "Tempo vs 1º",
      titulo: "Duração da apuração no 2º turno comparada à do 1º (negativo = mais rápido)",
      dir0: "asc",
      get: (l) => difTempo(l, agoraMin2),
      render: (l) => {
        const d = difTempo(l, agoraMin2);
        if (d == null) return <span className="text-muted">—</span>;
        if (l.t2?.m == null) return <span className="text-xs">já {fmtDuracao(d)} além do 1º</span>;
        return <span className={cx("text-xs", d < 0 ? "font-semibold text-fg" : "text-fg")}>{fmtDiferenca(d)}</span>;
      },
    },
    {
      id: "lider",
      grupo: "cmp",
      rotulo: "Líder 1º → 2º",
      titulo: "Quem estava à frente no 1º turno e quem está no 2º turno",
      dir0: "asc",
      get: (l) => (l.lider1 && l.lider2 && l.lider1 !== l.lider2 ? 0 : 1),
      render: (l) => (
        <span className={cx("inline-flex items-center gap-1.5 text-xs", l.destaque && "font-semibold")}>
          <NomeLider b={l.lider1} />
          <span className="text-muted">→</span>
          <NomeLider b={l.t2 ? l.lider2 : null} />
          {l.destaque && <span className="rounded bg-warn-bg px-1 text-[10px] font-semibold text-warn-fg">virou</span>}
        </span>
      ),
    },
  ];
}

export const GRUPOS_LUGARES = {
  t1: { rotulo: "1º turno · urnas fecharam às 17h", cor: "var(--viz-ref)" },
  t2: { rotulo: "2º turno · urnas fecharam às 19h", cor: "var(--viz-foco)" },
  cmp: { rotulo: "1º → 2º turno" },
};

// ---------------------------------------------------------------------------
// Estados: ritmo da apuração nos dois turnos
// ---------------------------------------------------------------------------

export interface LinhaRitmo extends LinhaBase {
  t1: TemposLugar | null;
  t2: TemposLugar | null;
  /** % do eleitorado em municípios concluídos agora (2º turno) */
  agora2: number | null;
  /** idem no 1º turno, no mesmo tempo após o fechamento */
  mesmo1: number | null;
}

const pctOuTraco = (v: number | null | undefined) => (v == null ? <span className="text-muted">—</span> : <span className="tabular-nums">{fmtPct(v, 1)}</span>);
const duracao = (m: number | null | undefined, pendente: string) =>
  m == null ? <span className="text-xs text-muted">{pendente}</span> : <span className="font-semibold tabular-nums">{fmtDuracao(m)}</span>;

export function colunasRitmo(): ColunaPainel<LinhaRitmo>[] {
  const dif = (l: LinhaRitmo) => (l.agora2 != null && l.mesmo1 != null ? l.agora2 - l.mesmo1 : null);
  const marco = (k: "m50" | "m90" | "m100", rot: string): ColunaPainel<LinhaRitmo>[] => [
    {
      id: `${k}1`,
      grupo: k,
      rotulo: "1º turno",
      titulo: `Tempo até ${rot} do eleitorado em municípios concluídos — 1º turno`,
      dir0: "asc",
      get: (l) => l.t1?.[k] ?? null,
      render: (l) => duracao(l.t1?.[k], "—"),
    },
    {
      id: `${k}2`,
      grupo: k,
      rotulo: "2º turno",
      titulo: `Tempo até ${rot} do eleitorado em municípios concluídos — 2º turno`,
      dir0: "asc",
      get: (l) => l.t2?.[k] ?? null,
      render: (l) => duracao(l.t2?.[k], "ainda não"),
    },
  ];
  return [
    {
      id: "pa2",
      grupo: "agora",
      rotulo: "Seções apuradas",
      titulo: "% das seções já apuradas no 2º turno",
      get: (l) => l.t2?.pa ?? null,
      render: (l) => pctOuTraco(l.t2?.pa),
    },
    {
      id: "ag2",
      grupo: "agora",
      rotulo: "Concluído (2º)",
      titulo: "% do eleitorado em municípios com a apuração concluída — 2º turno, agora",
      get: (l) => l.agora2,
      render: (l) => <span className="font-semibold">{pctOuTraco(l.agora2)}</span>,
    },
    {
      id: "ms1",
      grupo: "agora",
      rotulo: "1º no mesmo horário",
      titulo: "% do eleitorado em municípios concluídos no 1º turno, no mesmo tempo após o fechamento",
      get: (l) => l.mesmo1,
      render: (l) => pctOuTraco(l.mesmo1),
    },
    {
      id: "dif",
      grupo: "agora",
      rotulo: "Diferença",
      titulo: "Concluído no 2º turno − no 1º turno no mesmo horário (p.p.; positivo = 2º turno mais adiantado)",
      get: dif,
      render: (l) => {
        const d = dif(l);
        if (d == null) return <span className="text-muted">—</span>;
        const r = Math.round(d * 10) / 10 || 0;
        return (
          <span className="tabular-nums">
            {r > 0 ? "+" : r < 0 ? "−" : "±"}
            {fmtPct(Math.abs(r), 1).replace("%", "")} p.p.
          </span>
        );
      },
    },
    ...marco("m50", "50%"),
    ...marco("m90", "90%"),
    ...marco("m100", "100%"),
  ];
}

export const GRUPOS_RITMO = {
  agora: { rotulo: "Agora (mesmo tempo após o fechamento)", cor: "var(--viz-foco)" },
  m50: { rotulo: "50% concluído em" },
  m90: { rotulo: "90% concluído em" },
  m100: { rotulo: "100% concluído em" },
};
