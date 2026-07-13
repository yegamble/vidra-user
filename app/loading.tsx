import { Skeleton } from "@/components/ui";
import { VideoGridSkeleton } from "@/components/VideoCardSkeleton";

// Route-level loading boundary. Matches the home feed's real geometry —
// max-w-[1480px] container, heading block, then the shared VideoGrid-shaped
// skeleton — so navigating between pages doesn't snap between a narrow
// four-column ghost and the actual three-column feed. Views keep their own
// skeletons for client-side fetches; this only covers the navigation gap
// before a page renders.
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-12 pt-7 sm:px-6 sm:pb-16 sm:pt-10 lg:px-8"
    >
      <span className="sr-only">Loading page…</span>
      <div aria-hidden className="mb-6 flex flex-col gap-2 lg:mb-8">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-64 rounded-lg sm:h-10" />
        <Skeleton className="mt-1 h-4 w-80 max-w-full" />
      </div>
      <VideoGridSkeleton />
    </main>
  );
}
