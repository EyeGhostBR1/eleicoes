// Esqueleto de página exibido enquanto os componentes do cliente carregam.
import { Card, Skeleton } from "./ui";

export default function PaginaSkeleton({ titulo }: { titulo?: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div>
        <Skeleton className="h-4 w-48" />
        {titulo ? (
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-strong sm:text-3xl">{titulo}</h1>
        ) : (
          <Skeleton className="mt-2 h-8 w-56" />
        )}
        <span className="sr-only">Carregando…</span>
      </div>
      <Card className="p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-2.5 w-full" />
        <Skeleton className="mt-3 h-3 w-64" />
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-12 w-40" />
            <Skeleton className="mt-5 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-full" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-64 p-4">
          <Skeleton className="h-full w-full" />
        </Card>
        <Card className="h-64 p-4">
          <Skeleton className="h-full w-full" />
        </Card>
      </div>
    </div>
  );
}
