import { expect, test } from "@playwright/test";

const SEARCH = /\/api\/v1\/videos\/search/;
const FEED = /\/api\/v1\/videos(\?|$)/;

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
  };
}

test("shows matching results for a query", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics")], limit: 20, offset: 0 } }),
  );
  await page.goto("/search?q=go");
  await expect(page.getByRole("heading", { name: "Go Basics" })).toBeVisible();
});

test("shows an empty state when nothing matches", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "zzz", videos: [], limit: 20, offset: 0 } }),
  );
  await page.goto("/search?q=zzz");
  await expect(page.getByText("No results")).toBeVisible();
});

test("load more appends the next page of results and hides at the end", async ({ page }) => {
  const offsets: string[] = [];
  await page.route(SEARCH, (route) => {
    const url = new URL(route.request().url());
    offsets.push(url.searchParams.get("offset") ?? "");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const videos =
      offset === 0
        ? Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Go Result ${i + 1}`))
        : [video("v20", "Go Result 21")];
    route.fulfill({ json: { query: "go", videos, limit: 20, offset } });
  });

  await page.goto("/search?q=go");
  await expect(page.getByRole("heading", { name: "Go Result 20" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Go Result 21" })).not.toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("heading", { name: "Go Result 21" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Go Result 1", exact: true })).toBeVisible();
  expect(offsets).toEqual(["0", "20"]);
  // The second page came back short (1 < 20): the pager hides.
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("prompts for a term when the query is blank", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByText("Search for videos")).toBeVisible();
});

test("the header search box navigates to results", async ({ page }) => {
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics")], limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await page.getByLabel("Search videos").fill("go");
  await page.getByLabel("Search videos").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=go/);
  await expect(page.getByRole("heading", { name: "Go Basics" })).toBeVisible();
});
