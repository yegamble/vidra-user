import { expect, test } from "@playwright/test";

// Accessibility smoke for the app shell landmarks: one banner (header), a
// labeled primary navigation, exactly ONE search landmark (the header box does
// all searching — no second inline field), and exactly one main region.
const FEED_URL = /\/api\/v1\/videos(\?|$)/;
const SEARCH = /\/api\/v1\/videos\/search/;

test("home exposes banner, labeled primary nav, a single search, and exactly one main", async ({
  page,
}) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  // Exactly one role="search" landmark app-wide.
  await expect(page.getByRole("search")).toHaveCount(1);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("header")).toHaveCount(1);
});

test("the results page has exactly one search landmark (the header box, no inline field)", async ({
  page,
}) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "go", videos: [], limit: 20, offset: 0 } }),
  );
  await page.goto("/search?q=go");
  await expect(page.getByRole("main")).toBeVisible();
  // The header search is the only search landmark; the page itself has none.
  await expect(page.getByRole("search")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("search")).toHaveCount(0);
});
