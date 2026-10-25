// Chips de resumo: onde cada um lidera e os maiores deslocamentos vs 2022.
import Link from "next/link";
import { BLOCOS } from "@/lib/config";
import { fmtInt } from "@/lib/format";
import type { BlocoId } from "@/lib/types";
import type { LinhaLugar } from "./TabelaComparativa";
import { DeltaPP, Dot } from "./ui";

function liderBloco(l: LinhaLugar): BlocoId | "outro" | null {
  if (l.lider) return l.lider.bloco ?? "outro";
  const a = l.pt.p2026;
  const b = l.bo.p2026;
  if (a == null || b == null || a === b) return null;
  return a > b ? "pt" : "bolso";
}

function vencedor22(l: LinhaLugar): BlocoId | null {
  const a = l.pt.p2022;
  const b = l.bo.p2022;
  if (a == null || b == null || a === b) return null;
  return a > b ? "pt" : "bolso";
}

function Contador({ cor, rotulo, n }: { cor: string; rotulo: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm">
      <Dot cor={cor} />
      {rotulo} <span className="font-semibold text-strong">{fmtInt(n)}</span>
    </span>
  );
}

function Top({
  titulo,
  linhas,
  get,
}: {
  titulo: string;
  linhas: LinhaLugar[];
  get: (l: LinhaLugar) => number | null;
}) {
  if (!linhas.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      <ul className="flex flex-wrap gap-1.5">
        {linhas.map((l) => (
          <li key={l.id}>
            <Link
              href={l.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs hover:bg-surface-2"
            >
              <span className="font-medium text-fg">{l.sub ? l.sub : l.nome}</span>
              <DeltaPP v={get(l)} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ResumoLugares({
  linhas,
  plural,
  minApurado = 0,
  topN = 3,
}: {
  linhas: LinhaLugar[];
  /** "estados" | "municípios" */
  plural: string;
  /** % apurado mínimo para entrar nos rankings de variação (evita ruído de poucas seções) */
  minApurado?: number;
  topN?: number;
}) {
  const comLive = linhas.filter((l) => l.pt.p2026 != null || l.bo.p2026 != null);

  if (!comLive.length) {
    // antes da apuração: resumo de 2022
    let pt = 0;
    let bo = 0;
    for (const l of linhas) {
      const v = vencedor22(l);
      if (v === "pt") pt++;
      else if (v === "bolso") bo++;
    }
    if (!pt && !bo) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Em 2022 ({plural}):</span>
        <Contador cor={BLOCOS.pt.cor} rotulo="Lula venceu em" n={pt} />
        <Contador cor={BLOCOS.bolso.cor} rotulo="Jair venceu em" n={bo} />
      </div>
    );
  }

  let pt = 0;
  let bo = 0;
  let outro = 0;
  for (const l of comLive) {
    const v = liderBloco(l);
    if (v === "pt") pt++;
    else if (v === "bolso") bo++;
    else if (v === "outro") outro++;
  }
  const semDados = linhas.length - comLive.length;

  let base = comLive.filter((l) => (l.pa ?? 0) >= minApurado);
  if (base.length < 5) base = comLive;
  const top = (get: (l: LinhaLugar) => number | null) =>
    base
      .filter((l) => get(l) != null)
      .sort((a, b) => (get(b) as number) - (get(a) as number))
      .slice(0, topN);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Lidera agora ({plural}):</span>
        <Contador cor={BLOCOS.pt.cor} rotulo="Lula" n={pt} />
        <Contador cor={BLOCOS.bolso.cor} rotulo="Flávio" n={bo} />
        {outro > 0 && <Contador cor="var(--c-outros)" rotulo="Outros" n={outro} />}
        {semDados > 0 && <span className="text-xs text-muted">· {fmtInt(semDados)} sem votos apurados ainda</span>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Top titulo="Lula: melhores variações vs 2022" linhas={top((l) => l.pt.d22)} get={(l) => l.pt.d22} />
        <Top titulo="Flávio: melhores variações vs Jair 2022" linhas={top((l) => l.bo.d22)} get={(l) => l.bo.d22} />
      </div>
      {minApurado > 0 && base.length !== comLive.length && (
        <p className="text-xs text-muted">Rankings consideram apenas {plural} com ao menos {minApurado}% das seções apuradas.</p>
      )}
    </div>
  );
}
