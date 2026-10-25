"use client";
// Seletor de local (Brasil / UF / município / país ou cidade do exterior) com busca simples — combobox acessível.
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizar } from "@/lib/compare";
import { UF_POR_SIGLA, UFS } from "@/lib/config";
import { listaPaises, paisDaCidade } from "@/lib/exterior/paises";
import type { EscopoBoletim, MunicipioTuple } from "@/lib/types";
import { BRASIL, chaveEscopo, cx, escopoMun, escopoPais, escopoUf, nomeProprio, rotuloTipoEscopo, siglaUf } from "./util";

interface Opcao {
  chave: string;
  escopo: EscopoBoletim;
  rotulo: string;
  detalhe: string;
}

const OPCOES_FIXAS: Opcao[] = [
  { chave: "br", escopo: BRASIL, rotulo: "Brasil", detalhe: "País" },
  ...UFS.map((u) => ({
    chave: `uf:${u.sigla}`,
    escopo: escopoUf(u.sigla),
    rotulo: u.nome,
    detalhe: u.sigla === "zz" ? "Votos no exterior" : `Estado · ${u.sigla.toUpperCase()}`,
  })),
];

/** Países com seção eleitoral brasileira (só aparecem na busca). */
const OPCOES_PAISES: Opcao[] = listaPaises().map((p) => ({
  chave: `pais:${p}`,
  escopo: escopoPais(p),
  rotulo: p,
  detalhe: "País · exterior",
}));

const FIXAS_NORM = [...OPCOES_FIXAS, ...OPCOES_PAISES].map((o) => ({
  o,
  n: normalizar(o.rotulo),
  sigla: o.escopo.tipo === "uf" ? (o.escopo.uf ?? "") : o.escopo.tipo === "br" ? "br" : "",
}));

const MAX_MUN = 40;

function opcaoMun(t: MunicipioTuple): Opcao {
  const ext = t[2].toLowerCase() === "zz";
  return {
    chave: `mun:${t[2]}:${t[0]}`,
    escopo: escopoMun(t),
    rotulo: nomeProprio(t[1]),
    detalhe: ext ? `Cidade · ${paisDaCidade(t[0])?.pais ?? "exterior"}` : `Município · ${siglaUf(t[2])}`,
  };
}

export default function LocalPicker({
  valor,
  onChange,
  municipios,
  carregando,
  rotulo = "Local",
}: {
  valor: EscopoBoletim;
  onChange: (e: EscopoBoletim) => void;
  municipios?: MunicipioTuple[];
  carregando?: boolean;
  rotulo?: string;
}) {
  const uid = useId();
  const inputId = `${uid}-local`;
  const listaId = `${uid}-lista`;
  const optId = (i: number) => `${uid}-op-${i}`;

  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const indice = useMemo(() => (municipios ?? []).map((t) => ({ t, n: normalizar(t[1]) })), [municipios]);

  const opcoes = useMemo<Opcao[]>(() => {
    let termo = normalizar(busca)
      .replace(/[(),/\-–]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!termo) return OPCOES_FIXAS;

    // "campinas sp" → filtra pela UF
    let ufFiltro: string | null = null;
    const m = termo.match(/^(.+?) ([a-z]{2})$/);
    if (m && UF_POR_SIGLA[m[2]]) {
      termo = m[1];
      ufFiltro = m[2];
    }

    const fixas = ufFiltro
      ? []
      : FIXAS_NORM.filter((f) => f.n.startsWith(termo) || f.n.includes(` ${termo}`) || f.sigla === termo).map(
          (f) => f.o,
        );

    const comeca: { t: MunicipioTuple; n: string }[] = [];
    const contem: { t: MunicipioTuple; n: string }[] = [];
    for (const it of indice) {
      if (ufFiltro && it.t[2].toLowerCase() !== ufFiltro) continue;
      if (it.n.startsWith(termo)) comeca.push(it);
      else if (contem.length < MAX_MUN && it.n.includes(termo)) contem.push(it);
    }
    comeca.sort((a, b) => a.n.length - b.n.length || a.n.localeCompare(b.n));
    const muns = [...comeca, ...contem].slice(0, MAX_MUN).map((it) => opcaoMun(it.t));
    return [...fixas, ...muns];
  }, [busca, indice]);

  const ativoSeguro = Math.min(ativo, Math.max(0, opcoes.length - 1));

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (!aberto) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-i="${ativoSeguro}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [ativoSeguro, aberto]);

  function escolher(o: Opcao | undefined) {
    if (!o) return;
    onChange(o.escopo);
    setAberto(false);
    setBusca("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!aberto) setAberto(true);
      setAtivo(Math.min(ativoSeguro + 1, opcoes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo(Math.max(ativoSeguro - 1, 0));
    } else if (e.key === "Enter") {
      if (aberto) {
        e.preventDefault();
        escolher(opcoes[ativoSeguro]);
      }
    } else if (e.key === "Escape") {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
        setBusca("");
      }
    }
  }

  const atual = chaveEscopo(valor);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {rotulo}
        </label>
        {valor.tipo !== "br" && (
          <button
            type="button"
            onClick={() => onChange(BRASIL)}
            className="text-[11px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Voltar para Brasil
          </button>
        )}
      </div>
      <div className="relative mt-1">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-activedescendant={aberto && opcoes.length ? optId(ativoSeguro) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={aberto ? busca : valor.nome}
          placeholder={aberto ? `${valor.nome} — digite Brasil, um estado, município ou país` : undefined}
          onFocus={() => {
            setAberto(true);
            setBusca("");
            setAtivo(0);
          }}
          onClick={() => {
            // reabre ao clicar de novo após escolher (o foco continua no campo)
            if (!aberto) {
              setAberto(true);
              setBusca("");
              setAtivo(0);
            }
          }}
          onBlur={() => {
            setAberto(false);
            setBusca("");
          }}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo(0);
            setAberto(true);
          }}
          onKeyDown={aoTeclar}
          className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-20 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-zinc-500 dark:text-zinc-400">
          {rotuloTipoEscopo(valor)}
        </span>
        {aberto && (
          <ul
            ref={listaRef}
            id={listaId}
            role="listbox"
            aria-label="Locais"
            className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            {opcoes.map((o, i) => (
              <li
                key={o.chave}
                id={optId(i)}
                data-i={i}
                role="option"
                aria-selected={i === ativoSeguro}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(o)}
                className={cx(
                  "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5",
                  i === ativoSeguro ? "bg-zinc-100 dark:bg-zinc-800" : "",
                )}
              >
                <span className={cx("truncate", o.chave === atual && "font-semibold")}>{o.rotulo}</span>
                <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">{o.detalhe}</span>
              </li>
            ))}
            {busca.trim() && carregando && (
              <li role="presentation" className="px-3 py-1.5 text-xs text-zinc-500">
                Carregando municípios…
              </li>
            )}
            {!opcoes.length && !carregando && (
              <li role="presentation" className="px-3 py-1.5 text-xs text-zinc-500">
                Nenhum local encontrado.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
