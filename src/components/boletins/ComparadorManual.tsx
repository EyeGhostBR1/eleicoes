"use client";
// Comparador manual: cole o texto de um boletim (ou digite os números) e compare com 2022/2018/TSE.
import { useDeferredValue, useId, useMemo, useState } from "react";
import { BLOCOS } from "@/lib/config";
import { useListaMunicipios } from "@/lib/client/hooks";
import { classificarBoletim, parseBoletim } from "@/lib/news/parse";
import type { EscopoBoletim, MunicipioTuple, NumerosBoletim, TipoBoletim } from "@/lib/types";
import { TipoTag } from "./BoletimCard";
import ComparacaoBoletim from "./ComparacaoBoletim";
import LocalPicker from "./LocalPicker";
import { BRASIL, campoInvalido, cx, fmtCampo, fmtPctLivre, lerPct } from "./util";

const EXEMPLO = "Com 62% das urnas apuradas, Lula tem 47,8% e Flávio 44,1% em Minas Gerais";

function lerTexto(texto: string, municipios?: MunicipioTuple[]): NumerosBoletim {
  if (!texto.trim()) return {};
  try {
    return parseBoletim(texto, municipios) ?? {};
  } catch {
    return {};
  }
}

function classificar(texto: string): TipoBoletim | null {
  if (!texto.trim()) return null;
  try {
    return classificarBoletim(texto);
  } catch {
    return null;
  }
}

function fin(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/** Valores editados pelo usuário (sobrepõem o que foi lido do texto). */
interface Edicoes {
  pt?: string;
  bolso?: string;
  apurado?: string;
  escopo?: EscopoBoletim;
}

function CampoPct({
  id,
  rotulo,
  valor,
  onChange,
  cor,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  cor?: string;
}) {
  const invalido = campoInvalido(valor);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex items-center gap-1.5 truncate text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {cor && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />}
        {rotulo}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalido || undefined}
          aria-describedby={invalido ? `${id}-erro` : undefined}
          className={cx(
            "w-full rounded-lg border bg-white py-2 pl-2.5 pr-6 text-right text-sm font-semibold tabular-nums text-zinc-900 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100",
            invalido
              ? "border-orange-500 focus:ring-orange-400/40"
              : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-400/30 dark:border-zinc-700",
          )}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-zinc-400">
          %
        </span>
      </div>
      {invalido && (
        <p id={`${id}-erro`} className="mt-0.5 text-[11px] text-orange-700 dark:text-orange-400">
          Use 0 a 100
        </p>
      )}
    </div>
  );
}

export default function ComparadorManual({ className }: { className?: string }) {
  const uid = useId();
  const lista = useListaMunicipios();
  const municipios = lista.data;

  const [texto, setTexto] = useState("");
  const [ed, setEd] = useState<Edicoes>({});

  const textoAdiado = useDeferredValue(texto);
  const lido = useMemo(() => lerTexto(textoAdiado, municipios), [textoAdiado, municipios]);
  const tipo = useMemo(() => classificar(textoAdiado), [textoAdiado]);

  const campoPt = ed.pt ?? fmtCampo(lido.pt);
  const campoBolso = ed.bolso ?? fmtCampo(lido.bolso);
  const campoApurado = ed.apurado ?? fmtCampo(lido.pctApurado);
  const escopo = ed.escopo ?? lido.escopo ?? BRASIL;

  const pt = campoInvalido(campoPt) ? null : lerPct(campoPt);
  const bolso = campoInvalido(campoBolso) ? null : lerPct(campoBolso);
  const apurado = campoInvalido(campoApurado) ? null : lerPct(campoApurado);
  const somaAlta = (pt ?? 0) + (bolso ?? 0) > 100.05;
  // "Lula vence na China" (sem %): o vencedor lido do texto vale enquanto o local também vier do texto
  const vencedor = !ed.escopo ? lido.vencedor : undefined;

  function mudarTexto(v: string) {
    setTexto(v);
    // O texto volta a mandar nos campos que ele próprio informa; edições manuais dos demais são mantidas.
    const novo = lerTexto(v, municipios);
    setEd((e) => {
      const n = { ...e };
      if (fin(novo.pt)) delete n.pt;
      if (fin(novo.bolso)) delete n.bolso;
      if (fin(novo.pctApurado)) delete n.apurado;
      if (novo.escopo) delete n.escopo;
      return n;
    });
  }

  function limpar() {
    setTexto("");
    setEd({});
  }

  const temTexto = textoAdiado.trim().length > 0;
  const leuAlgo = fin(lido.pt) || fin(lido.bolso) || fin(lido.pctApurado) || !!lido.escopo || !!lido.vencedor;

  return (
    <section
      aria-labelledby={`${uid}-titulo`}
      className={cx(
        "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      <h2 id={`${uid}-titulo`} className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Comparador manual
      </h2>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        Viu um boletim na TV ou nas redes? Cole o texto ou digite os números para comparar com 2022, 2018 e os números
        oficiais de agora (TSE no Brasil; boletins de urna no exterior).
      </p>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${uid}-texto`} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Texto do boletim
          </label>
          <div className="flex gap-3 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => mudarTexto(EXEMPLO)}
              className="text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Usar exemplo
            </button>
            {(texto || Object.keys(ed).length > 0) && (
              <button
                type="button"
                onClick={limpar}
                className="text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <textarea
          id={`${uid}-texto`}
          rows={3}
          value={texto}
          onChange={(e) => mudarTexto(e.target.value)}
          placeholder={`Cole aqui o texto de um boletim (ex.: '${EXEMPLO}')`}
          className="mt-1 block w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-snug text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        {temTexto && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
            <span className="text-zinc-500">Lido do texto:</span>
            {tipo && <TipoTag tipo={tipo} />}
            {leuAlgo ? (
              <>
                {fin(lido.pctApurado) && <span className="tabular-nums">{fmtPctLivre(lido.pctApurado)} apurado</span>}
                {fin(lido.pt) && <span className="tabular-nums">· Lula {fmtPctLivre(lido.pt)}</span>}
                {fin(lido.bolso) && <span className="tabular-nums">· Flávio {fmtPctLivre(lido.bolso)}</span>}
                {lido.escopo && <span>· {lido.escopo.nome}</span>}
                {lido.vencedor && <span>· vencedor: {lido.vencedor === "pt" ? "Lula" : "Flávio"}</span>}
              </>
            ) : (
              <span>nenhum número reconhecido — preencha os campos abaixo.</span>
            )}
          </div>
        )}
        {temTexto && (tipo === "boca-de-urna" || tipo === "pesquisa") && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
            {tipo === "boca-de-urna"
              ? "Parece boca de urna — estimativa de instituto, não resultado da apuração."
              : "Parece pesquisa de intenção de voto — não é resultado da apuração."}
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CampoPct
          id={`${uid}-pt`}
          rotulo="Lula"
          cor={BLOCOS.pt.cor}
          valor={campoPt}
          onChange={(v) => setEd((e) => ({ ...e, pt: v }))}
        />
        <CampoPct
          id={`${uid}-bolso`}
          rotulo="Flávio"
          cor={BLOCOS.bolso.cor}
          valor={campoBolso}
          onChange={(v) => setEd((e) => ({ ...e, bolso: v }))}
        />
        <CampoPct
          id={`${uid}-apurado`}
          rotulo="Apurado"
          valor={campoApurado}
          onChange={(v) => setEd((e) => ({ ...e, apurado: v }))}
        />
      </div>
      {somaAlta && (
        <p className="mt-1 text-[11px] text-orange-700 dark:text-orange-400">
          Lula + Flávio passa de 100% — confira os valores (use % dos votos válidos).
        </p>
      )}

      <div className="mt-3">
        <LocalPicker
          valor={escopo}
          onChange={(e) => setEd((x) => ({ ...x, escopo: e }))}
          municipios={municipios}
          carregando={lista.isLoading}
        />
      </div>

      <div className="mt-4">
        {/* sem % digitado, a comparação usa os números oficiais de agora do local escolhido */}
        <ComparacaoBoletim
          variante="painel"
          pt={pt}
          bolso={bolso}
          pctApurado={apurado}
          vencedor={vencedor}
          escopo={escopo}
        />
      </div>
    </section>
  );
}
