import { FeedFilters } from "@/components/FeedFilters";
import { FeedScopeToggle } from "@/components/FeedScopeToggle";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { LiveNowRail } from "@/components/LiveNowRail";
import { VideoFeed } from "@/components/VideoFeed";
import {
  feedDefaultsForLanding,
  resolveFeedScope,
  resolveLandingPage,
} from "@/lib/feed-defaults";
import { readFeedFilters, type FeedUrlDefaults } from "@/lib/feed-url";
import { getInstanceConfig } from "@/lib/instance-config.server";

// /trending is the canonical trending surface: the public feed with
// sort=trending preselected, sharing the home page's segmented sort control
// (Recent/Popular link back to the home feed modes), filter row, and VideoFeed
// grid. The home page's ?sort=trending deep link keeps working; this route is
// the linkable navigation destination (sidebar entry, PeerTube parity).
// The scope fallback honours the operator's defaults.feed_scope (config-parity
// W5); an explicit ?scope= still wins, and no snapshot means local (shipped).
export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; category?: string; language?: string; scope?: string }>;
}) {
  const [sp, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  // This surface is not the landing switch — browse defaults apply directly
  // (home-recent maps landing-neutrally onto feed_sort/feed_scope).
  const browseDefaults = feedDefaultsForLanding("home-recent", instance?.defaults);
  // URL-building baseline: the sort chips lead back to "/", whose bare-URL
  // sort is the LANDING-aware default (landing=trending makes bare "/" show
  // trending, so an explicit Recent pick must stay explicit there); the scope
  // baseline is THIS page's effective default scope.
  const urlDefaults: FeedUrlDefaults = {
    sort: feedDefaultsForLanding(resolveLandingPage(instance?.defaults), instance?.defaults).sort,
    scope: browseDefaults.scope,
  };
  const filters = readFeedFilters(sp);
  const scope = resolveFeedScope(filters.scope, browseDefaults.scope);
  const feedKey = [
    "trending",
    scope,
    filters.category ?? "",
    filters.language ?? "",
    filters.tag ?? "",
  ].join("|");
  return (
    <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-12 pt-7 sm:px-6 sm:pb-16 sm:pt-10 lg:px-8">
      <section
        aria-labelledby="trending-feed-heading"
        className="mb-6 flex flex-col gap-5 lg:mb-8 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-xl">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.09em] text-fg-muted">
            Explore
          </p>
          <h1
            id="trending-feed-heading"
            className="text-[28px] font-bold leading-tight tracking-[-0.035em] text-fg sm:text-[32px]"
          >
            Trending videos
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">
            What viewers are discovering right now.
          </p>
        </div>
        <FeedSortTabs active="trending" filters={filters} urlDefaults={urlDefaults} />
      </section>
      <div className="scrollbar-none mb-8 flex flex-nowrap items-center gap-2.5 overflow-x-auto sm:flex-wrap sm:overflow-x-visible">
        <FeedScopeToggle active={scope} sort="trending" filters={filters} urlDefaults={urlDefaults} />
        <FeedFilters sort="trending" filters={filters} urlDefaults={urlDefaults} />
      </div>
      {/* "Live now" rail — persists across the shared sort chips (matches the
          design's single feed screen, where Recent/Popular/Trending are re-sorts
          of one surface that keeps the rail). Renders nothing when nothing's live. */}
      <LiveNowRail />
      <VideoFeed key={feedKey} sort="trending" filters={filters} />
    </main>
  );
}
