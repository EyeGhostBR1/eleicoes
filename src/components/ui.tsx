// Primitivos visuais compartilhados (sem hooks — podem ser usados em server e client components).
import type { HTMLAttributes, ReactNode } from "react";
import type { BlocoId } from "@/lib/types";
import { fmtPP } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

/** Cor de TEXTO do bloco (ajustada ao tema claro/escuro via CSS). */
export function corTextoBloco(b: BlocoId): string {
  return b === "pt" ? "var(--c-pt)" : "var(--c-bolso)";
}

export function Card({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx("rounded-xl border border-line bg-surface shadow-sm", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionTitle({
  children,
  sub,
  id,
  right,
}: {
  children: ReactNode;
  sub?: ReactNode;
  id?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-strong sm:text-xl">
          {children}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-md bg-surface-2", className)} />;
}

/** Bloco de esqueleto com várias linhas. */
export function SkeletonLinhas({ n = 4, className }: { n?: number; className?: string }) {
  return (
    <div className={cx("space-y-2", className)} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

export function Badge({
  children,
  tom = "neutro",
  className,
}: {
  children: ReactNode;
  tom?: "neutro" | "ok" | "aviso" | "pt" | "bolso";
  className?: string;
}) {
  const estilos: Record<string, string> = {
    neutro: "border-line bg-surface-2 text-muted",
    ok: "border-transparent bg-ok/15 text-ok",
    aviso: "border-transparent bg-warn-bg text-warn-fg",
    pt: "border-transparent bg-pt/15 text-pt",
    bolso: "border-transparent bg-bolso/15 text-bolso",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        estilos[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Variação em p.p. com seta e cor (verde = subiu, laranja = caiu). */
export function DeltaPP({
  v,
  casas = 1,
  className,
  semSufixo,
}: {
  v: number | null | undefined;
  casas?: 1 | 2;
  className?: string;
  /** omite " p.p." (útil em tabelas compactas) */
  semSufixo?: boolean;
}) {
  if (v == null || !isFinite(v)) return <span className={cx("text-muted", className)}>—</span>;
  // arredonda na precisão exibida para não mostrar "▼ −0,0"
  const f = 10 ** casas;
  const r = Math.round(v * f) / f || 0;
  const txt = fmtPP(r, casas);
  const t = semSufixo ? txt.replace(" p.p.", "") : txt;
  const sobe = r > 0;
  const desce = r < 0;
  return (
    <span
      className={cx(
        "whitespace-nowrap font-medium",
        sobe ? "text-up" : desce ? "text-down" : "text-muted",
        className,
      )}
      title={txt}
    >
      <span aria-hidden className="mr-0.5 text-[0.75em]">
        {sobe ? "▲" : desce ? "▼" : "●"}
      </span>
      <span className="sr-only">{sobe ? "subiu " : desce ? "caiu " : "estável "}</span>
      {t}
    </span>
  );
}

/** Ponto colorido (legenda). */
export function Dot({ cor, className }: { cor: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ background: cor }}
    />
  );
}

/** Controle segmentado acessível (grupo de botões com aria-pressed). */
export function Segmentado<T extends string | number>({
  opcoes,
  valor,
  onChange,
  rotulo,
  tamanho = "sm",
}: {
  opcoes: { valor: T; rotulo: ReactNode; titulo?: string }[];
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
  tamanho?: "sm" | "xs";
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {opcoes.map((o) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            aria-pressed={ativo}
            title={o.titulo}
            onClick={() => onChange(o.valor)}
            className={cx(
              "rounded-md font-medium transition-colors",
              tamanho === "xs" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
              ativo ? "bg-surface text-strong shadow-sm" : "text-muted hover:text-fg",
            )}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** Mensagem de erro genérica de carregamento. */
export function ErroCarga({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-fg">
      <span className="font-medium">Não foi possível carregar os dados.</span> <span className="text-muted">{msg}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-2 font-medium text-strong underline underline-offset-2">
          Tentar novamente
        </button>
      )}
    </div>
  );
}
