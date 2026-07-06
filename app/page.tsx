import { FeedFilters } from "@/components/FeedFilters";
import { FeedScopeToggle } from "@/components/FeedScopeToggle";
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

// The home feed. The active sort mode, the tag/category/language filters AND
// the federation scope live in the URL (?sort=…&scope=…&category=…&language=…
// &tag=…) so every view is shareable and back-button friendly; the controls
// push a new URL and this server page re-renders the heading + remounts the
// feed. Scope "all" mixes federated remote videos into the feed (remote:true
// cards); the default is local-only.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    scope?: string;
    tag?: string;
    category?: string;
    language?: string;
  }>;
}) {
  const sp = await searchParams;
  const active = toFeedSort(sp.sort);
  const filters = readFeedFilters(sp);
  const scope = filters.scope ?? "local";
  const feedKey = [
    active,
    scope,
    filters.category ?? "",
    filters.language ?? "",
    filters.tag ?? "",
  ].join("|");
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{HEADINGS[active]}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <FeedScopeToggle active={scope} sort={active} filters={filters} />
          <FeedSortTabs active={active} filters={filters} />
        </div>
      </div>
      <div className="mb-6">
        <FeedFilters sort={active} filters={filters} />
      </div>
      <VideoFeed key={feedKey} sort={active} filters={filters} />
    </main>
  );
}
