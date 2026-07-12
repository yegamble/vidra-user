import { FeedFilters } from "@/components/FeedFilters";
import { FeedScopeToggle } from "@/components/FeedScopeToggle";
import { FeedSortTabs } from "@/components/FeedSortTabs";
import { HomepageDocument } from "@/components/HomepageDocument";
import { LiveNowRail } from "@/components/LiveNowRail";
import { VideoFeed } from "@/components/VideoFeed";
import type { FeedSort } from "@/lib/api";
import {
  feedDefaultsForLanding,
  resolveFeedScope,
  resolveFeedSort,
  resolveLandingPage,
  shouldRenderHomepageDocument,
} from "@/lib/feed-defaults";
import { readFeedFilters } from "@/lib/feed-url";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { getInstanceHomepage } from "@/lib/instance-homepage.server";

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
        <FeedSortTabs active={active} filters={filters} urlDefaults={landingDefaults} />
      </section>
      {/* Scope and taxonomy are one quiet refinement toolbar instead of several
          disconnected controls. It wraps cleanly at phone and text-zoom widths. */}
      <div className="mb-9 flex flex-col gap-3 rounded-[20px] border border-border-subtle bg-surface-muted/65 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
        <FeedScopeToggle active={scope} sort={active} filters={filters} urlDefaults={landingDefaults} />
        <FeedFilters sort={active} filters={filters} urlDefaults={landingDefaults} />
      </div>
      {/* "Live now" discovery rail — currently-live public streams (GET /live).
          Self-contained: renders nothing when nothing is live or the read fails,
          so it never reserves space or shows an error on the public feed. */}
      <LiveNowRail />
      <VideoFeed key={feedKey} sort={active} filters={filters} />
    </main>
  );
}
