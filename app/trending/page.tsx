import { FeedFilters } from "@/components/FeedFilters";
import { FeedSortTabs } from "@/components/FeedSortTabs";
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
  searchParams: Promise<{ tag?: string; category?: string; language?: string }>;
}) {
  const sp = await searchParams;
  const filters = readFeedFilters(sp);
  const feedKey = ["trending", filters.category ?? "", filters.language ?? "", filters.tag ?? ""].join(
    "|",
  );
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Trending videos</h1>
        <FeedSortTabs active="trending" filters={filters} />
      </div>
      <div className="mb-6">
        <FeedFilters sort="trending" filters={filters} />
      </div>
      <VideoFeed key={feedKey} sort="trending" filters={filters} />
    </main>
  );
}
