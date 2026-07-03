import { FeedFilters } from "@/components/FeedFilters";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { VideoFeed } from "@/components/VideoFeed";
import type { FeedSort } from "@/lib/api";
import { readFeedFilters } from "@/lib/feed-url";

const HEADINGS: Record<FeedSort, string> = {
  recent: "Recent videos",
  popular: "Popular videos",
  trending: "Trending videos",
};

// Unknown ?sort= values fall back to recent, mirroring the backend's behavior.
function toFeedSort(value: string | undefined): FeedSort {
  return value === "popular" || value === "trending" ? value : "recent";
}

// The home feed. The active sort mode AND the tag/category/language filters
// live in the URL (?sort=…&category=…&language=…&tag=…) so every view is
// shareable and back-button friendly; the controls push a new URL and this
// server page re-renders the heading + remounts the feed.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; tag?: string; category?: string; language?: string }>;
}) {
  const sp = await searchParams;
  const active = toFeedSort(sp.sort);
  const filters = readFeedFilters(sp);
  const feedKey = [active, filters.category ?? "", filters.language ?? "", filters.tag ?? ""].join(
    "|",
  );
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{HEADINGS[active]}</h1>
        <FeedSortTabs active={active} filters={filters} />
      </div>
      <div className="mb-6">
        <FeedFilters sort={active} filters={filters} />
      </div>
      <VideoFeed key={feedKey} sort={active} filters={filters} />
    </main>
  );
}
