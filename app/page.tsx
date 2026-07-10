import { FeedFilters } from "@/components/FeedFilters";
import { FeedScopeToggle } from "@/components/FeedScopeToggle";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { LiveNowRail } from "@/components/LiveNowRail";
import { VideoFeed } from "@/components/VideoFeed";
import type { FeedSort } from "@/lib/api";
import { readFeedFilters } from "@/lib/feed-url";

const HEADINGS: Record<FeedSort, string> = {
  recent: "Recent videos",
  popular: "Popular videos",
  trending: "Trending videos",
};

const DESCRIPTIONS: Record<FeedSort, string> = {
  recent: "Fresh releases from creators across your community.",
  popular: "The videos people are returning to most.",
  trending: "What viewers are discovering right now.",
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
    <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-12 pt-7 sm:px-6 sm:pb-16 sm:pt-10 lg:px-8">
      {/* A visible large title gives the feed a stable sense of place. The sort
          remains URL-backed, so the title and supporting copy update together. */}
      <section
        aria-labelledby="home-feed-heading"
        className="mb-6 flex flex-col gap-5 lg:mb-8 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-xl">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.09em] text-fg-muted">
            Explore
          </p>
          <h1
            id="home-feed-heading"
            className="text-[28px] font-bold leading-tight tracking-[-0.035em] text-fg sm:text-[32px]"
          >
            {HEADINGS[active]}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
            {DESCRIPTIONS[active]}
          </p>
        </div>
        <FeedSortTabs active={active} filters={filters} />
      </section>
      {/* Scope and taxonomy are one quiet refinement toolbar instead of several
          disconnected controls. It wraps cleanly at phone and text-zoom widths. */}
      <div className="mb-9 flex flex-col gap-3 rounded-[20px] border border-border-subtle bg-surface-muted/65 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
        <FeedScopeToggle active={scope} sort={active} filters={filters} />
        <FeedFilters sort={active} filters={filters} />
      </div>
      {/* "Live now" discovery rail — currently-live public streams (GET /live).
          Self-contained: renders nothing when nothing is live or the read fails,
          so it never reserves space or shows an error on the public feed. */}
      <LiveNowRail />
      <VideoFeed key={feedKey} sort={active} filters={filters} />
    </main>
  );
}
