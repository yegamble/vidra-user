import { WatchSkeleton } from "@/components/watch/WatchSkeleton";

// Watch-route loading boundary: the same <main> shell as page.tsx wrapping the
// shared watch silhouette, so clicking a video never flashes the generic feed
// skeleton before the player area appears. <main> is bare: the skeleton carries
// the page's own `.watch-layout` grid, exactly as the loaded page does, so the
// handoff from this boundary to the page does not shift.
export default function Loading() {
  return (
    <main aria-busy="true" className="flex w-full min-w-0 flex-1 flex-col">
      <span className="sr-only">Loading video…</span>
      <WatchSkeleton />
    </main>
  );
}
