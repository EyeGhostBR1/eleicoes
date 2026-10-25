import type { FonteId } from "@/lib/types";
import { cx, infoFonte } from "./util";

/** Selo neutro do veículo, com faixa de cor própria à esquerda. */
export default function FonteBadge({
  fonte,
  nome,
  className,
}: {
  fonte: FonteId;
  /** nome legível vindo da API (usado no title e para "outros") */
  nome?: string;
  className?: string;
}) {
  const info = infoFonte(fonte);
  const rotulo = fonte === "outros" && nome ? nome : info.curto;
  return (
    <span
      title={nome || info.nome}
      className={cx(
        "inline-block max-w-[11rem] shrink-0 truncate align-middle rounded border border-l-[3px] border-zinc-200 bg-zinc-50 px-1.5 py-px text-[11px] font-semibold leading-4 tracking-wide text-zinc-800",
        "dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100",
        className,
      )}
      style={{ borderLeftColor: info.cor }}
    >
      {rotulo}
    </span>
  );
}
