"use client";
// Peças visuais compartilhadas pelas telas do exterior (página /exterior, cartão da home,
// banner do /estado/zz e cartão das cidades do exterior).
import { BLOCOS } from "@/lib/config";
import { pct } from "@/lib/compare";
import type { HttpError } from "@/lib/client/hooks";
import { fmtDataHora, fmtHora, fmtInt, fmtPct } from "@/lib/format";
import type { ExtAgregado, ExteriorResponse, Turno } from "@/lib/types";
import { useContagem } from "../StatusApuracao";
import { Card, ErroCarga, Skeleton, cx } from "../ui";
import { bandeira, pctRecebido } from "./dados";

/** Intervalo de atualização de /api/exterior (igual ao de useExterior). */
export const REFRESH_EXTERIOR_MS = 60_000;

export function Bandeira({ iso2, className }: { iso2?: string | null; className?: string }) {
  return (
    <span aria-hidden className={cx("inline-block w-[1.4em] shrink-0 text-center leading-none", className)}>
      {bandeira(iso2)}
    </span>
  );
}

/** Barra fina de progresso (seções recebidas). */
export function MiniProgresso({ v, className }: { v: number | null; className?: string }) {
  const w = v == null ? 0 : Math.max(0, Math.min(100, v));
  return (
    <span aria-hidden className={cx("block h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <span className="block h-full rounded-full bg-strong/70" style={{ width: `${w}%` }} />
    </span>
  );
}

/** Lula × Flávio: dois números grandes e barra Lula | outros | Flávio (válidos). */
export function Placar({ ag, tamanho = "lg" }: { ag: ExtAgregado; tamanho?: "lg" | "md" }) {
  const p = pct(ag.pt, ag.validos);
  const b = pct(ag.bo, ag.validos);
  const outros = p != null && b != null ? Math.max(0, 100 - p - b) : null;
  const num = tamanho === "lg" ? "text-4xl sm:text-5xl" : "text-3xl";
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--c-pt)" }}>
            {BLOCOS.pt.nomes["2026"]}
          </p>
          <p className={cx("font-bold leading-none tracking-tight", num)} style={{ color: "var(--c-pt)" }}>
            {fmtPct(p, 1)}
          </p>
          <p className="mt-1 text-xs text-muted">{fmtInt(ag.pt)} votos</p>
        </div>
        <span aria-hidden className="pb-6 text-sm font-medium text-muted">
          ×
        </span>
        <div className="text-right">
          <p className="text-sm font-semibold" style={{ color: "var(--c-bolso)" }}>
            {BLOCOS.bolso.nomes["2026"]}
          </p>
          <p className={cx("font-bold leading-none tracking-tight", num)} style={{ color: "var(--c-bolso)" }}>
            {fmtPct(b, 1)}
          </p>
          <p className="mt-1 text-xs text-muted">{fmtInt(ag.bo)} votos</p>
        </div>
      </div>
      <div
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`Votos válidos: ${BLOCOS.pt.nomes["2026"]} ${fmtPct(p, 1)}, outros ${fmtPct(outros, 1)}, ${BLOCOS.bolso.nomes["2026"]} ${fmtPct(b, 1)}`}
      >
        <span style={{ width: `${p ?? 0}%`, background: BLOCOS.pt.cor }} />
        <span style={{ width: `${outros ?? 0}%`, background: "var(--c-outros)" }} className="opacity-60" />
        <span style={{ width: `${b ?? 0}%`, background: BLOCOS.bolso.cor }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>% dos votos válidos</span>
        {outros != null && outros >= 0.05 && <span>Outros: {fmtPct(outros, 1)}</span>}
      </div>
    </div>
  );
}

/** Seções recebidas, horário do último boletim e contagem para a próxima atualização. */
export function StatusExterior({
  data,
  error,
  isValidating,
  mutate,
  compacto,
}: {
  data: ExteriorResponse;
  error: HttpError | undefined;
  isValidating: boolean;
  mutate: () => void;
  compacto?: boolean;
}) {
  const resta = useContagem(isValidating, REFRESH_EXTERIOR_MS);
  const t = data.total;
  const pa = pctRecebido(t);
  const tudo = t.secoesTotal > 0 && t.secoesRecebidas >= t.secoesTotal;
  return (
    <div aria-label="Recebimento dos boletins de urna do exterior">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="flex items-baseline gap-2">
          <span className={cx("font-bold tracking-tight text-strong", compacto ? "text-lg" : "text-2xl")}>
            {fmtInt(t.secoesRecebidas)} de {fmtInt(t.secoesTotal)}
          </span>
          <span className="text-sm text-muted">seções com boletim recebido{pa != null ? ` (${fmtPct(pa, 1)})` : ""}</span>
        </p>
        {tudo && <span className="text-xs font-medium text-ok">✓ Todas as seções recebidas</span>}
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Seções do exterior com boletim recebido"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pa != null ? Math.round(pa * 10) / 10 : undefined}
        aria-valuetext={`${fmtInt(t.secoesRecebidas)} de ${fmtInt(t.secoesTotal)} seções`}
      >
        <div className="h-full rounded-full bg-strong transition-[width] duration-700" style={{ width: `${pa ?? 0}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted sm:text-sm">
        <span>
          Último boletim recebido:{" "}
          <span className="font-medium text-fg">{compacto ? fmtHora(data.ultimaRecepcao) : fmtDataHora(data.ultimaRecepcao)}</span>
          {!compacto && (
            <>
              {" "}
              · consulta às <span className="font-medium text-fg">{fmtHora(data.geradoEm)}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2" aria-live="off">
          {error && <span className="text-down">Falha na última atualização</span>}
          {isValidating ? <span>Atualizando…</span> : resta != null ? <span>Atualiza em {resta}s</span> : null}
          {!compacto && (
            <button
              type="button"
              onClick={mutate}
              disabled={isValidating}
              className="rounded-md border border-line px-2 py-0.5 font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
            >
              Atualizar
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

/** Esqueleto da primeira carga (a leitura dos boletins pode levar ~40 s quando fria). */
export function CarregandoExterior({ compacto }: { compacto?: boolean }) {
  return (
    <div aria-busy="true" role="status">
      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        <span aria-hidden className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-strong opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-strong/70" />
        </span>
        Lendo boletins de urna do exterior…
      </p>
      <p className="mt-1 text-xs text-muted">
        A primeira leitura baixa os boletins de centenas de seções no TSE e pode levar cerca de 1 minuto. As
        atualizações seguintes são rápidas.
      </p>
      <Skeleton className="mt-3 h-8 w-48" />
      <Skeleton className="mt-3 h-3 w-full" />
      {!compacto && <Skeleton className="mt-3 h-3 w-2/3" />}
    </div>
  );
}

/** Mensagem para 404 (nada publicado ainda — p.ex. 2º turno). */
export function SemBoletins({ turno, compacto }: { turno: Turno; compacto?: boolean }) {
  return (
    <div role="status">
      <p className={cx("font-semibold text-strong", compacto ? "text-sm" : "text-base")}>
        {turno === 2
          ? "Ainda não há boletins do exterior para o 2º turno."
          : "Ainda não há boletins de urna do exterior publicados."}
      </p>
      <p className="mt-1 text-sm text-muted">
        {turno === 2
          ? "Eles aparecem aqui assim que o TSE publicar os boletins das primeiras seções no exterior encerradas."
          : "Eles aparecem aqui assim que as primeiras seções no exterior encerrarem a votação."}
        {!compacto && " Enquanto isso, veja abaixo os resultados de 2022 e 2018 por país."}
      </p>
    </div>
  );
}

/** Estado de carga padrão (carregando / 404 / erro) num cartão. Retorna null quando há dados. */
export function CargaExterior({
  data,
  error,
  turno,
  mutate,
  compacto,
}: {
  data: ExteriorResponse | undefined;
  error: HttpError | undefined;
  turno: Turno;
  mutate: () => void;
  compacto?: boolean;
}) {
  if (data) return null;
  if (error?.status === 404)
    return (
      <Card className={compacto ? "p-4" : "p-5"}>
        <SemBoletins turno={turno} compacto={compacto} />
      </Card>
    );
  if (error) return <ErroCarga msg={`Boletins do exterior: ${error.message}`} onRetry={mutate} />;
  return (
    <Card className={compacto ? "p-4" : "p-5"}>
      <CarregandoExterior compacto={compacto} />
    </Card>
  );
}
