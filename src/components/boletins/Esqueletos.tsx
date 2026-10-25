// Esqueletos de carregamento (sem hooks — usáveis no servidor como fallback de <Suspense>).

function Bloco({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-zinc-200/80 dark:bg-zinc-800 ${className}`} />;
}

export function ListaCarregando({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando boletins">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center gap-2">
            <Bloco className="h-4 w-16" />
            <Bloco className="h-4 w-20" />
            <Bloco className="ml-auto h-3 w-24" />
          </div>
          <Bloco className="mt-3 h-4 w-11/12" />
          <Bloco className="mt-1.5 h-4 w-2/3" />
          {i === 0 && (
            <div className="mt-3 flex gap-1.5">
              <Bloco className="h-5 w-20 rounded-full" />
              <Bloco className="h-5 w-20 rounded-full" />
              <Bloco className="h-5 w-20 rounded-full" />
            </div>
          )}
        </div>
      ))}
      <span className="sr-only">Carregando boletins…</span>
    </div>
  );
}

/** Fallback da página inteira (enquanto o cliente lê a URL). */
export function BoletinsCarregando() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-3">
        <Bloco className="h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Bloco key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <ListaCarregando n={3} />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Bloco className="h-5 w-40" />
        <Bloco className="mt-3 h-20 w-full" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Bloco className="h-9" />
          <Bloco className="h-9" />
          <Bloco className="h-9" />
        </div>
        <Bloco className="mt-3 h-9 w-full" />
      </div>
    </div>
  );
}
