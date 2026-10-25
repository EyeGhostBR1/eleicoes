import { Suspense } from "react";
import PaginaSkeleton from "@/components/PaginaSkeleton";
import BrasilView from "@/components/views/BrasilView";

export default function Home() {
  return (
    <Suspense fallback={<PaginaSkeleton titulo="Brasil" />}>
      <BrasilView />
    </Suspense>
  );
}
