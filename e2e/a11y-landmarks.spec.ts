import { expect, test } from "@playwright/test";

// Accessibility smoke for the app shell landmarks: one banner (header), a
// labeled primary navigation, a search landmark, and exactly one main region.
const FEED_URL = /\/api\/v1\/videos(\?|$)/;

test("home exposes banner, labeled primary nav, search, and exactly one main", async ({
  page,
}) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("header")).toHaveCount(1);
});
