import { FeedFilters } from "@/components/FeedFilters";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { LiveNowRail } from "@/components/LiveNowRail";
import { VideoFeed } from "@/components/VideoFeed";
import { readFeedFilters } from "@/lib/feed-url";

// /trending is the canonical trending surface: the public feed with
// sort=trending preselected, sharing the home page's segmented sort control
// (Recent/Popular link back to the home feed modes), filter row, and VideoFeed
// grid. The home page's ?sort=trending deep link keeps working; this route is
// the linkable navigation destination (sidebar entry, PeerTube parity).
export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; category?: string; language?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const filters = readFeedFilters(sp);
  // The Local/All scope toggle renders on the home feed only, but an explicit
  // ?scope=all deep link (or one carried over by a sort switch) is honoured.
  const feedKey = [
    "trending",
    filters.scope ?? "local",
    filters.category ?? "",
    filters.language ?? "",
    filters.tag ?? "",
  ].join("|");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      {/* Heading kept for the page's programmatic heading (a11y / e2e) but
          visually hidden — the template leads with the chips, not a title. */}
      <h1 className="sr-only">Trending videos</h1>
      {/* Primary: shared sort chips lead (Recent/Popular link back to home). */}
      <div className="mb-4">
        <FeedSortTabs active="trending" filters={filters} />
      </div>
      {/* Secondary taxonomy filters — demoted below the chips (see home page). */}
      <div className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FeedFilters sort="trending" filters={filters} />
      </div>
      {/* "Live now" rail — persists across the shared sort chips (matches the
          design's single feed screen, where Recent/Popular/Trending are re-sorts
          of one surface that keeps the rail). Renders nothing when nothing's live. */}
      <LiveNowRail />
      <VideoFeed key={feedKey} sort="trending" filters={filters} />
    </main>
  );
}
