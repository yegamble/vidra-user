import { Suspense } from "react";

import { FeedFilters } from "@/components/FeedFilters";
import { FeedScopeToggle } from "@/components/FeedScopeToggle";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { HomepageDocument } from "@/components/HomepageDocument";
import { HomeRecommendationsRail } from "@/components/HomeRecommendationsRail";
import { HomeShelves } from "@/components/HomeShelves";
import { LiveNowRail } from "@/components/LiveNowRail";
import { PageShell } from "@/components/PageShell";
import { VideoFeed } from "@/components/VideoFeed";
import { VideoGridSkeleton } from "@/components/VideoCardSkeleton";
import type { FeedSort } from "@/lib/api";
import {
  feedDefaultsForLanding,
  resolveFeedScope,
  resolveFeedSort,
  resolveLandingPage,
  shouldRenderHomepageDocument,
} from "@/lib/feed-defaults";
import { readFeedFilters } from "@/lib/feed-url";
import type { FeedFilters as FeedFilterValues } from "@/lib/feed-url";
import { getPublicFeed } from "@/lib/feed.server";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { getInstanceHomepage } from "@/lib/instance-homepage.server";
import { PAGE_SIZE } from "@/components/ui/LoadMoreButton";

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

// The home feed. The active sort mode, the tag/category/language filters AND
// the federation scope live in the URL (?sort=…&scope=…&category=…&language=…
// &tag=…) so every view is shareable and back-button friendly; the controls
// push a new URL and this server page re-renders the heading + remounts the
// feed. Scope "all" mixes federated remote videos into the feed (remote:true
// cards).
//
// What a BARE "/" shows is operator-configurable (config-parity W5): the
// defaults.landing_page switch below picks the surface server-side (no client
// redirect flash), and defaults.feed_sort/feed_scope fill in whatever the URL
// leaves unsaid. Explicit URL params always win; with no snapshot (backend
// down, mocked e2e) everything falls back to the shipped recent/local feed.
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
  const [sp, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  const landing = resolveLandingPage(instance?.defaults);
  // The 'home' landing branch (config-parity W6): a bare "/" renders the
  // admin-authored homepage document when the operator picked it AND a
  // non-empty document is enabled. Explicit feed params always win (the feed
  // stays reachable/shareable), and an empty/unreachable document falls
  // through to the home-recent feed — never a blank page.
  if (shouldRenderHomepageDocument(landing, instance?.homepage, sp)) {
    const doc = await getInstanceHomepage();
    if (doc) return <HomepageDocument body={doc.body} />;
  }
  const landingDefaults = feedDefaultsForLanding(landing, instance?.defaults);
  const active = resolveFeedSort(sp.sort, landingDefaults.sort);
  const filters = readFeedFilters(sp);
  const scope = resolveFeedScope(filters.scope, landingDefaults.scope);
  const feedKey = [
    active,
    scope,
    filters.category ?? "",
    filters.language ?? "",
    filters.tag ?? "",
  ].join("|");
  return (
    <PageShell className="pb-12 pt-7 sm:pb-16 sm:pt-10">
      {/* Signed-in personalization band (Apple-TV shelves): "Continue watching"
          + "Following" rails ABOVE the browse feed. Client-fetched and authed-
          only, so it renders nothing for a signed-out viewer or a route-mocked
          e2e — the browse section below then leads exactly as before. */}
      <HomeShelves />
      {/* The browse feed reframed as the final shelf-consistent section: a
          Title2 header (matching the shelves above and the discovery rails
          below) over the URL-backed sort control. The sort remains URL-backed,
          so the title and supporting copy update together. */}
      <section
        aria-labelledby="home-feed-heading"
        className="mb-6 flex flex-col gap-5 lg:mb-8 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-xl">
          <h1 id="home-feed-heading" className="text-title2 text-fg">
            {HEADINGS[active]}
          </h1>
          <p className="mt-2 text-subhead text-fg-muted">{DESCRIPTIONS[active]}</p>
        </div>
        <FeedSortTabs active={active} filters={filters} urlDefaults={landingDefaults} />
      </section>
      {/* Scope and taxonomy are one quiet refinement row on the page canvas —
          a single horizontally scrollable strip on phones (YouTube's chip-row
          pattern) instead of a stacked filter card that pushed the first video
          below the fold. Wraps at sm+ and at text-zoom widths. */}
      <div className="scrollbar-none mb-8 flex flex-nowrap items-center gap-2.5 overflow-x-auto sm:flex-wrap sm:overflow-x-visible">
        <FeedScopeToggle active={scope} sort={active} filters={filters} urlDefaults={landingDefaults} />
        <FeedFilters sort={active} filters={filters} urlDefaults={landingDefaults} />
      </div>
      <Suspense key={feedKey} fallback={<StreamedFeedFallback />}>
        <StreamedVideoFeed sort={active} filters={{ ...filters, scope }} feedKey={feedKey} />
      </Suspense>
      {/* Optional discovery rails resolve independently in the browser. Keep
          them after the stable primary feed so a slow live/recommendation
          response never injects content above videos the viewer is already
          reading (the web.dev CLS guidance for late, variable content). */}
      <LiveNowRail />
      <HomeRecommendationsRail />
    </PageShell>
  );
}

async function StreamedVideoFeed({
  sort,
  filters,
  feedKey,
}: {
  sort: FeedSort;
  filters: FeedFilterValues;
  feedKey: string;
}) {
  const initialPage = await getPublicFeed({
    sort,
    scope: filters.scope,
    tag: filters.tag,
    category: filters.category,
    language: filters.language,
    limit: PAGE_SIZE,
    offset: 0,
  });
  return (
    <VideoFeed
      key={feedKey}
      sort={sort}
      filters={filters}
      initialPage={initialPage}
      prioritizeFirstRow
    />
  );
}

function StreamedFeedFallback() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading videos…</span>
      <VideoGridSkeleton />
    </div>
  );
}
