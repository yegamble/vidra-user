import { expect, test } from "@playwright/test";

// The feed loads client-side, so we route-mock the backend call (a real backend
// is not running in `npm run ci`). Match the feed endpoint but not its subpaths
// (/videos/search, /videos/{id}).
//
// The sort heading ("Popular videos" etc.) is an sr-only h1 — the template
// leads with the pill chips and shows no visible title — so it is asserted with
// toBeAttached() (present in the a11y tree), while the chip's aria-pressed
// carries the visible active-sort state.
const FEED_URL = /\/api\/v1\/videos(\?|$)/;

function video(id: string, title: string, views: number) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views,
    has_thumbnail: false,
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
  };
}

test("header brand is always present", async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Vidra" })).toBeVisible();
});

test("renders feed cards from the API", async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      json: {
        videos: [video("v1", "First Test Video", 1500), video("v2", "Second Test Video", 0)],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "First Test Video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Second Test Video" })).toBeVisible();
  await expect(page.getByText("1.5K views")).toBeVisible();
  // Each card links to its channel by handle and shows the channel name.
  const channelLinks = page.getByRole("link", { name: "Ada Makes" });
  await expect(channelLinks.first()).toHaveAttribute("href", "/channels/ada");
  await expect(channelLinks).toHaveCount(2);
});

test("feed cards show a duration badge when the card carries a duration", async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      json: {
        videos: [{ ...video("v1", "Timed Video", 10), duration_seconds: 83 }],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Timed Video" })).toBeVisible();
  await expect(page.getByText("1:23")).toBeVisible();
});

test("feed cards show the IPFS badge only for pinned videos", async ({ page }) => {
  // ipfs_pinned is the real card/feed field (vidra-core P19); the badge reflects
  // true pin state only — absent/false ⇒ no badge (never stubbed).
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      json: {
        videos: [
          { ...video("v1", "Pinned To IPFS", 10), ipfs_pinned: true },
          { ...video("v2", "Not Pinned", 10), ipfs_pinned: false },
          video("v3", "Field Absent", 10),
        ],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Not Pinned" })).toBeVisible();
  // Exactly one badge, on the pinned card only.
  const badges = page.getByTitle("Mirrored to IPFS");
  await expect(badges).toHaveCount(1);
  await expect(badges.first()).toBeVisible();
});

test("shows the empty state when there are no videos", async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await expect(page.getByText("No videos yet")).toBeVisible();
});

test("the sort control refetches with the selected sort and updates the URL", async ({ page }) => {
  const sorts: string[] = [];
  await page.route(FEED_URL, (route) => {
    const url = new URL(route.request().url());
    const sort = url.searchParams.get("sort") ?? "";
    sorts.push(sort);
    const titles: Record<string, string> = {
      recent: "Fresh Upload",
      popular: "Popular Pick",
      trending: "Trending Now",
    };
    route.fulfill({
      json: { videos: [video(`${sort}-v1`, titles[sort] ?? sort, 5)], sort, limit: 20, offset: 0 },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fresh Upload" })).toBeVisible();
  // exact: the card's "Actions for Popular Pick" menu button also contains "Popular".
  const popular = page.getByRole("button", { name: "Popular", exact: true });
  await expect(popular).toHaveAttribute("aria-pressed", "false");

  await popular.click();
  await expect(page).toHaveURL(/\/\?sort=popular$/);
  await expect(page.getByRole("heading", { name: "Popular videos" })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Popular Pick" })).toBeVisible();
  await expect(popular).toHaveAttribute("aria-pressed", "true");
  expect(sorts).toEqual(["recent", "popular"]);

  // Back-button friendly: going back restores the recent feed.
  await page.goBack();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page.getByRole("heading", { name: "Fresh Upload" })).toBeVisible();
  await expect(popular).toHaveAttribute("aria-pressed", "false");
  expect(sorts[sorts.length - 1]).toBe("recent");
});

test("a sort mode URL is shareable (deep link)", async ({ page }) => {
  await page.route(FEED_URL, (route) => {
    const sort = new URL(route.request().url()).searchParams.get("sort") ?? "";
    route.fulfill({
      json: { videos: [video("t1", "Trending Now", 9)], sort, limit: 20, offset: 0 },
    });
  });
  await page.goto("/?sort=trending");
  await expect(page.getByRole("heading", { name: "Trending videos" })).toBeAttached();
  // exact: the card's "Actions for Trending Now" menu button also contains "Trending".
  await expect(page.getByRole("button", { name: "Trending", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Trending Now" })).toBeVisible();
});

test("load more appends the next feed page and hides at the end", async ({ page }) => {
  await page.route(FEED_URL, (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? "0");
    const videos =
      offset === 0
        ? Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Feed Video ${i + 1}`, 1))
        : [video("v20", "Feed Video 21", 1)];
    route.fulfill({ json: { videos, sort: "recent", limit: 20, offset } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Feed Video 20" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Feed Video 21" })).not.toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("heading", { name: "Feed Video 21" })).toBeVisible();
  // The first page is still there (appended, not replaced).
  await expect(page.getByRole("heading", { name: "Feed Video 1", exact: true })).toBeVisible();
  // The second page came back short (1 < 20): the pager hides.
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("shows the error state when the feed fails", async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "internal", message: "boom" } },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
