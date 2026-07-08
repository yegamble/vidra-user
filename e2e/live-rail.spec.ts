import { expect, test } from "@playwright/test";

// The home "Live now" rail loads client-side from GET /api/v1/live (the public
// live listing, W1.C4). We route-mock it alongside the feed (no backend runs in
// `npm run ci`). The rail is a quiet discovery surface: present only when at
// least one public stream is live, and it never shows a viewer/"watching" count
// (the contract carries none — a W4 dependency, omitted not faked).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;
// Match /api/v1/live and /api/v1/live?… but NOT /api/v1/live/{id}.
const LIVE_URL = /\/api\/v1\/live(\?|$)/;

const EMPTY_FEED = { videos: [], sort: "recent", limit: 20, offset: 0 };

function liveCard(id: string, title: string, display: string, handle: string) {
  return {
    id,
    title,
    channel_handle: handle,
    channel_display_name: display,
    is_live: true,
    started_at: new Date().toISOString(),
  };
}

test("home shows the Live now rail with a card per live public stream", async ({ page }) => {
  await page.route(FEED_URL, (route) => route.fulfill({ json: EMPTY_FEED }));
  await page.route(LIVE_URL, (route) =>
    route.fulfill({
      json: {
        live_streams: [
          liveCard("11111111-1111-1111-1111-111111111111", "Late-night grading", "Grade House", "gradehouse"),
          liveCard("22222222-2222-2222-2222-222222222222", "Field diary, live", "Aurora Lab", "auroralab"),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.goto("/");

  // The rail is a named region with a heading and a pluralized stream count.
  const rail = page.getByRole("region", { name: "Live now" });
  await expect(rail.getByRole("heading", { name: "Live now" })).toBeVisible();
  await expect(rail.getByText("2 streams")).toBeVisible();

  // Each card links to its /live/{id} watch page and shows title + channel.
  const first = rail.getByRole("link", { name: /Late-night grading/ });
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("href", "/live/11111111-1111-1111-1111-111111111111");
  await expect(rail.getByText("Grade House")).toBeVisible();
  await expect(rail.getByRole("link", { name: /Field diary, live/ })).toHaveAttribute(
    "href",
    "/live/22222222-2222-2222-2222-222222222222",
  );

  // The LIVE badge rides on each card; the design's "N watching" chip is NOT
  // rendered (no server-side viewer count exists — omitted, never faked).
  await expect(rail.getByText("Live", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/watching/i)).toHaveCount(0);
});

test("no Live now rail when nothing is live", async ({ page }) => {
  await page.route(FEED_URL, (route) => route.fulfill({ json: EMPTY_FEED }));
  await page.route(LIVE_URL, (route) =>
    route.fulfill({ json: { live_streams: [], limit: 20, offset: 0 } }),
  );

  await page.goto("/");
  // The feed's own empty state proves the page settled; the rail is absent.
  await expect(page.getByText("No videos yet")).toBeVisible();
  await expect(page.getByRole("region", { name: "Live now" })).toHaveCount(0);
});

test("the live rail also rides the trending feed screen", async ({ page }) => {
  await page.route(FEED_URL, (route) => route.fulfill({ json: { ...EMPTY_FEED, sort: "trending" } }));
  await page.route(LIVE_URL, (route) =>
    route.fulfill({
      json: {
        live_streams: [
          liveCard("33333333-3333-3333-3333-333333333333", "Solo stream", "North Loop", "northloop"),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.goto("/trending");
  const rail = page.getByRole("region", { name: "Live now" });
  await expect(rail.getByText("1 stream")).toBeVisible();
  await expect(rail.getByRole("link", { name: /Solo stream/ })).toHaveAttribute(
    "href",
    "/live/33333333-3333-3333-3333-333333333333",
  );
});
