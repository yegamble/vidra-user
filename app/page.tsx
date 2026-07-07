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
      {/* The template leads the feed with the pill chips and shows no page
          heading; the h1 is kept for the page's programmatic heading (a11y /
          landmarks / e2e) but visually hidden so the chips carry the hierarchy. */}
      <h1 className="sr-only">{HEADINGS[active]}</h1>
      {/* Primary: Recent / Popular / Trending filter chips lead (template language). */}
      <div className="mb-4">
        <FeedSortTabs active={active} filters={filters} />
      </div>
      {/* Secondary controls — federation scope + taxonomy filters. The template
          mockup shows neither; they are retained (real, tested features) but
          demoted below the chips as a quieter row so the chips stay the lead. */}
      <div className="mb-7 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FeedScopeToggle active={scope} sort={active} filters={filters} />
        <FeedFilters sort={active} filters={filters} />
      </div>
      <VideoFeed key={feedKey} sort={active} filters={filters} />
    </main>
  );
}
