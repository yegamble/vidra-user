import { VideoCard } from "@/components/VideoCard";
import type { Video } from "@/lib/api";

// HomeShelf is the Apple-TV shelf recipe (design-system.md "Shelves on Home"):
// a Title2 section header + a horizontal snap rail of read-only VideoCards. It
// is purely presentational — the personalized data + the authed-only fetch
// guard live in HomeShelves. The rail hides its scrollbar (`scrollbar-none`)
// and never widens the page (each tile is `flex-none` at a viewport-capped
// width), so the phone canvas keeps its no-overflow contract at 390.
export function HomeShelf({
  heading,
  items,
  count,
  progressFor,
}: {
  heading: string;
  items: readonly Video[];
  /** Optional right-aligned count caption, mirroring the discovery rails. */
  count?: number;
  /**
   * Per-item resume fraction (0..1) for the thin progress bar across the tile —
   * the "Continue watching" shelf passes it; "Following" omits it. Called with
   * the item and its index so callers can read a parallel history array.
   */
  progressFor?: (video: Video, index: number) => number | undefined;
}) {
  return (
    <section aria-label={heading}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-title2 text-fg">{heading}</h2>
        {typeof count === "number" ? (
          <span className="shrink-0 text-[13px] tabular-nums text-fg-muted">{count}</span>
        ) : null}
      </div>
      {/* Horizontal scroll rail: viewport-capped tiles, hidden scrollbar (the
          row scrolls on touch / trackpad; focus order still reaches each card). */}
      <ul className="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {items.map((video, index) => (
          <li
            key={video.id}
            className="w-[min(82vw,20rem)] flex-none snap-start sm:w-72 lg:w-64 xl:w-72"
          >
            <VideoCard video={video} progressFraction={progressFor?.(video, index)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
