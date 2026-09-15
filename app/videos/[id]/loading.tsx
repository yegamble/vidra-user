import { WATCH_CONTENT } from "@/components/watch/layout";
import { WatchSkeleton } from "@/components/watch/WatchSkeleton";

// Watch-route loading boundary: the same <main> shell as page.tsx wrapping the
// shared watch silhouette, so clicking a video never flashes the generic feed
// skeleton before the player area appears. <main> is bare and the page
// container is the shared WATCH_CONTENT — the same two boxes WatchView renders,
// so the handoff from this boundary to the page does not shift.
export default function Loading() {
  return (
    <main aria-busy="true" className="flex w-full min-w-0 flex-1 flex-col">
      <div className={WATCH_CONTENT}>
        <span className="sr-only">Loading video…</span>
        <WatchSkeleton />
      </div>
    </main>
  );
}
