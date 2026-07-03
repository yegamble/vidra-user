import { expect, test } from "@playwright/test";

// The /trending route: the public feed with sort=trending preselected. The feed
// call is route-mocked (no backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 7,
    has_thumbnail: false,
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
  };
}

test("/trending fetches the trending feed and marks the Trending tab active", async ({ page }) => {
  const sorts: string[] = [];
  await page.route(FEED_URL, (route) => {
    const sort = new URL(route.request().url()).searchParams.get("sort") ?? "";
    sorts.push(sort);
    route.fulfill({
      json: { videos: [video("t1", "Hot Right Now")], sort, limit: 20, offset: 0 },
    });
  });

  await page.goto("/trending");
  await expect(page.getByRole("heading", { name: "Trending videos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hot Right Now" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Trending" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(sorts).toEqual(["trending"]);
});

test("the sidebar links to /trending and the tabs link back to the home modes", async ({
  page,
}) => {
  await page.route(FEED_URL, (route) => {
    const sort = new URL(route.request().url()).searchParams.get("sort") ?? "recent";
    route.fulfill({ json: { videos: [], sort, limit: 20, offset: 0 } });
  });

  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Trending" })
    .click();
  await expect(page).toHaveURL(/\/trending$/);
  await expect(page.getByRole("heading", { name: "Trending videos" })).toBeVisible();

  // The segmented control leads back to the home-feed modes.
  await page.getByRole("button", { name: "Recent" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Recent videos" })).toBeVisible();
});

test("the home Trending tab navigates to the /trending route", async ({ page }) => {
  await page.route(FEED_URL, (route) => {
    const sort = new URL(route.request().url()).searchParams.get("sort") ?? "recent";
    route.fulfill({ json: { videos: [], sort, limit: 20, offset: 0 } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Trending" }).click();
  await expect(page).toHaveURL(/\/trending$/);
  await expect(page.getByRole("heading", { name: "Trending videos" })).toBeVisible();
});
