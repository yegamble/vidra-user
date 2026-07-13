import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton silhouette of VideoCard (thumbnail → avatar + two text lines) sized
// to the same geometry as the card that replaces it. The route-level skeleton
// (app/loading.tsx), the feed's client-fetch skeleton (VideoFeed), and the
// final grid all share this one shape, so a navigation reads as one steady
// surface filling in — not three different layouts flashing past each other.
export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <div className="flex gap-3">
        <Skeleton className="mt-0.5 h-9 w-9 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}

/** A grid of card skeletons in VideoGrid's exact geometry (see VideoGrid.tsx). */
export function VideoGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
