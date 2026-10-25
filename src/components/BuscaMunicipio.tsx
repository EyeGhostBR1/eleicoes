"use client";
// Busca global de municípios com autocomplete (sem acento/caixa), navegação por teclado.
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useListaMunicipios, useParamsState } from "@/lib/client/hooks";
import { normalizar } from "@/lib/compare";
import { UF_POR_SIGLA } from "@/lib/config";
import type { MunicipioTuple } from "@/lib/types";
import { cx } from "./ui";

const MAX_SUGESTOES = 12;

interface Item {
  t: MunicipioTuple;
  n: string; // nome normalizado
}

function buscar(itens: Item[], consulta: string): MunicipioTuple[] {
  const q = normalizar(consulta).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return [];
  // "campinas sp" / "campinas (sp)" / "campinas - sp" → filtra pela UF
  const m = q.match(/^(.*\S)\s*[-,/]?\s+([a-z]{2})$/);
  if (m && UF_POR_SIGLA[m[2]]) {
    const r = filtrar(itens, m[1].replace(/[-,/]\s*$/, "").trim(), m[2]);
    if (r.length) return r;
  }
  return filtrar(itens, q, null);
}

function filtrar(itens: Item[], q: string, uf: string | null): MunicipioTuple[] {
  if (!q) return [];
  const comeca: MunicipioTuple[] = [];
  const palavra: MunicipioTuple[] = [];
  const contem: MunicipioTuple[] = [];
  for (const it of itens) {
    if (uf && it.t[2] !== uf) continue;
    const i = it.n.indexOf(q);
    if (i < 0) continue;
    if (i === 0) comeca.push(it.t);
    else if (it.n[i - 1] === " " || it.n[i - 1] === "-") palavra.push(it.t);
    else contem.push(it.t);
  }
  const porTamanho = (a: MunicipioTuple, b: MunicipioTuple) => a[1].length - b[1].length || a[1].localeCompare(b[1], "pt-BR");
  comeca.sort(porTamanho);
  palavra.sort(porTamanho);
  contem.sort(porTamanho);
  return [...comeca, ...palavra, ...contem].slice(0, MAX_SUGESTOES);
}

export default function BuscaMunicipio({
  className,
  onEscolher,
  placeholder = "Buscar município…",
}: {
  className?: string;
  /** em vez de abrir a página do município, entrega o escolhido (ex.: mapa interativo) */
  onEscolher?: (t: MunicipioTuple) => void;
  placeholder?: string;
}) {
  const { qs } = useParamsState();
  const router = useRouter();
  const lista = useListaMunicipios();
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-lista`;

  const itens = useMemo<Item[]>(
    () => (lista.data ?? []).map((t) => ({ t, n: normalizar(t[1]) })),
    [lista.data],
  );
  const resultados = useMemo(() => buscar(itens, texto), [itens, texto]);
  const mostrar = aberto && texto.trim().length >= 2;
  const idxAtivo = Math.min(ativo, Math.max(0, resultados.length - 1));

  function ir(t: MunicipioTuple) {
    setAberto(false);
    setTexto("");
    inputRef.current?.blur();
    if (onEscolher) onEscolher(t);
    else router.push(`/cidade/${t[2]}/${t[0]}${qs}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => (resultados.length ? (Math.min(a, resultados.length - 1) + 1) % resultados.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) =>
        resultados.length ? (Math.min(a, resultados.length - 1) - 1 + resultados.length) % resultados.length : 0,
      );
    } else if (e.key === "Enter") {
      if (mostrar && resultados[idxAtivo]) {
        e.preventDefault();
        ir(resultados[idxAtivo]);
      }
    } else if (e.key === "Escape") {
      if (aberto) {
        e.preventDefault();
        setAberto(false);
      } else {
        setTexto("");
      }
    }
  }

  const optId = (i: number) => `${baseId}-op-${i}`;

  return (
    <div className={cx("relative", className)}>
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Buscar município
      </label>
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l4 4" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="search"
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && resultados.length ? optId(idxAtivo) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAtivo(0);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setAberto(false)}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-sm text-fg placeholder:text-muted focus:border-transparent"
        />
      </div>
      {mostrar && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Municípios encontrados"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {lista.isLoading && !lista.data ? (
            <li className="px-3 py-2 text-sm text-muted">Carregando lista de municípios…</li>
          ) : lista.error && !lista.data ? (
            <li className="px-3 py-2 text-sm text-muted">Lista de municípios indisponível.</li>
          ) : resultados.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">Nenhum município encontrado.</li>
          ) : (
            resultados.map((t, i) => (
              <li
                key={`${t[2]}-${t[0]}`}
                id={optId(i)}
                role="option"
                aria-selected={i === idxAtivo}
                // mousedown evita o blur do input antes do clique
                onMouseDown={(e) => {
                  e.preventDefault();
                  ir(t);
                }}
                onMouseEnter={() => setAtivo(i)}
                className={cx(
                  "flex cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 text-sm",
                  i === idxAtivo ? "bg-surface-2 text-strong" : "text-fg",
                )}
              >
                <span className="truncate">
                  {t[1]} <span className="text-muted">({t[2] === "zz" ? "Exterior" : t[2].toUpperCase()})</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
