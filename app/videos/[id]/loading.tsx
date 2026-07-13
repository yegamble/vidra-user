import { WatchSkeleton } from "@/components/watch/WatchSkeleton";

// Watch-route loading boundary: the same <main> shell as page.tsx wrapping the
// shared watch silhouette, so clicking a video never flashes the generic feed
// skeleton before the player area appears.
export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-4 sm:px-6 sm:py-6"
    >
      <span className="sr-only">Loading video…</span>
      <WatchSkeleton />
    </main>
  );
}
