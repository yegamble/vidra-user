import { expect, test, type Page } from "@playwright/test";

const SEARCH = /\/api\/v1\/videos\/search/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const CONFIG_URL = /\/api\/v1\/videos\/config$/;

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

// mockConfig routes the shared taxonomy that populates the filter selects.
async function mockConfig(page: Page) {
  await page.route(CONFIG_URL, (route) =>
    route.fulfill({
      json: {
        categories: [
          { id: "1", label: "Music" },
          { id: "7", label: "Gaming" },
        ],
        licenses: [{ id: "1", label: "CC BY" }],
        languages: [
          { id: "en", label: "English" },
          { id: "fr", label: "French" },
        ],
        privacies: [{ id: "public", label: "Public" }],
      },
    }),
  );
}

// mockSearchCollecting records each search request's filter-relevant params.
async function mockSearchCollecting(
  page: Page,
  calls: Array<Record<string, string | null>>,
  count = 1,
) {
  await page.route(SEARCH, (route) => {
    const url = new URL(route.request().url());
    calls.push({
      q: url.searchParams.get("q"),
      tag: url.searchParams.get("tag"),
      category: url.searchParams.get("category"),
      language: url.searchParams.get("language"),
    });
    const videos = count > 0 ? [video("v1", "Go Basics")] : [];
    route.fulfill({ json: { query: url.searchParams.get("q") ?? "", videos, limit: 20, offset: 0 } });
  });
}

// The search page is dynamic (searchParams): wait for the config-driven selects
// to enable before interacting, and scope label queries through the a11y tree
// (getByRole("main")) so any streamed streaming duplicate is never matched.
async function searchFiltersReady(page: Page) {
  await expect(page.getByRole("main").getByLabel("Filter by category")).toBeEnabled({
    timeout: 20_000,
  });
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

test("category/language filters narrow the search and land in the URL", async ({ page }) => {
  await mockConfig(page);
  const calls: Array<Record<string, string | null>> = [];
  await mockSearchCollecting(page, calls);

  await page.goto("/search?q=go");
  await searchFiltersReady(page);
  const main = page.getByRole("main");

  await main.getByLabel("Filter by category").selectOption("7");
  await expect(page).toHaveURL(/\/search\?q=go&category=7$/);
  await expect(main.getByLabel("Filter by category")).toHaveValue("7");

  await main.getByLabel("Filter by language").selectOption("en");
  await expect(page).toHaveURL(/\/search\?q=go&category=7&language=en$/);

  // Poll: the URL updates before the remounted results' refetch lands.
  await expect
    .poll(() => calls)
    .toEqual([
      { q: "go", tag: null, category: null, language: null },
      { q: "go", tag: null, category: "7", language: null },
      { q: "go", tag: null, category: "7", language: "en" },
    ]);
});

test("a filtered search URL is a shareable deep link that preselects the controls", async ({
  page,
}) => {
  await mockConfig(page);
  const calls: Array<Record<string, string | null>> = [];
  await mockSearchCollecting(page, calls);

  await page.goto("/search?q=go&category=1&language=fr");
  await searchFiltersReady(page);
  const main = page.getByRole("main");
  await expect(main.getByLabel("Filter by category")).toHaveValue("1");
  await expect(main.getByLabel("Filter by language")).toHaveValue("fr");
  await expect
    .poll(() => calls[0])
    .toEqual({ q: "go", tag: null, category: "1", language: "fr" });
});

test("an active ?tag= filter shows a removable chip and narrows the search", async ({ page }) => {
  await mockConfig(page);
  const calls: Array<Record<string, string | null>> = [];
  await mockSearchCollecting(page, calls, 0);

  await page.goto("/search?q=go&tag=cats");
  await searchFiltersReady(page);
  const main = page.getByRole("main");
  await expect(main.getByText("#cats")).toBeVisible();
  await expect(main.getByText("No results")).toBeVisible();
  expect(calls[0]).toEqual({ q: "go", tag: "cats", category: null, language: null });

  await main.getByRole("link", { name: "Remove tag filter cats" }).click();
  await expect(page).toHaveURL(/\/search\?q=go$/);
  await expect(main.getByText("#cats")).toHaveCount(0);
  await expect
    .poll(() => calls[calls.length - 1])
    .toEqual({ q: "go", tag: null, category: null, language: null });
});
