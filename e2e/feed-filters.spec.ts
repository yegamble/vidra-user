import { expect, test, type Page } from "@playwright/test";

// URL-reflected browse filters (home + /trending): category/language selects
// driven by GET /videos/config, and a removable ?tag= chip. The backend calls
// are route-mocked (no backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;
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
    views: 3,
    has_thumbnail: false,
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
  };
}

// Collects every feed request's filter-relevant query params, in order.
async function mockFeed(page: Page, calls: Array<Record<string, string | null>>, count = 1) {
  await page.route(FEED_URL, (route) => {
    const url = new URL(route.request().url());
    calls.push({
      sort: url.searchParams.get("sort"),
      tag: url.searchParams.get("tag"),
      category: url.searchParams.get("category"),
      language: url.searchParams.get("language"),
    });
    const videos = count > 0 ? [video(`v${calls.length}`, `Clip ${calls.length}`)] : [];
    route.fulfill({ json: { videos, sort: url.searchParams.get("sort") ?? "recent", limit: 20, offset: 0 } });
  });
}

test.beforeEach(async ({ page }) => {
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
});

test("selecting category and language filters the feed and lands in the URL", async ({
  page,
}) => {
  const calls: Array<Record<string, string | null>> = [];
  await mockFeed(page, calls);

  await page.goto("/");
  const category = page.getByLabel("Filter by category");
  await expect(category).toBeEnabled();
  await category.selectOption("7");
  await expect(page).toHaveURL(/\/\?category=7$/);
  await expect(page.getByLabel("Filter by category")).toHaveValue("7");

  await page.getByLabel("Filter by language").selectOption("en");
  await expect(page).toHaveURL(/\/\?category=7&language=en$/);

  expect(calls).toEqual([
    { sort: "recent", tag: null, category: null, language: null },
    { sort: "recent", tag: null, category: "7", language: null },
    { sort: "recent", tag: null, category: "7", language: "en" },
  ]);
});

test("a filtered URL is a shareable deep link that preselects the controls", async ({ page }) => {
  const calls: Array<Record<string, string | null>> = [];
  await mockFeed(page, calls);

  await page.goto("/?category=1&language=fr");
  await expect(page.getByLabel("Filter by category")).toHaveValue("1");
  await expect(page.getByLabel("Filter by language")).toHaveValue("fr");
  expect(calls[0]).toEqual({ sort: "recent", tag: null, category: "1", language: "fr" });
});

test("an active ?tag= filter shows a removable chip and narrows the feed", async ({ page }) => {
  const calls: Array<Record<string, string | null>> = [];
  await mockFeed(page, calls, 0);

  await page.goto("/?tag=cats");
  // Scoped to the main region: during hydration a streamed duplicate of the
  // page content can transiently exist outside <main>.
  const main = page.getByRole("main");
  await expect(main.getByText("#cats")).toBeVisible();
  // A filtered empty result explains itself.
  await expect(main.getByText("No matching videos")).toBeVisible();
  expect(calls[0]).toEqual({ sort: "recent", tag: "cats", category: null, language: null });

  await main.getByRole("link", { name: "Remove tag filter cats" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(main.getByText("#cats")).toHaveCount(0);
  await expect
    .poll(() => calls[calls.length - 1])
    .toEqual({ sort: "recent", tag: null, category: null, language: null });
});

test("switching sort keeps the active filters in the URL", async ({ page }) => {
  const calls: Array<Record<string, string | null>> = [];
  await mockFeed(page, calls);

  await page.goto("/?category=7");
  await page.getByRole("button", { name: "Popular" }).click();
  await expect(page).toHaveURL(/\/\?sort=popular&category=7$/);
  await expect(page.getByLabel("Filter by category")).toHaveValue("7");

  await page.getByRole("button", { name: "Trending" }).click();
  await expect(page).toHaveURL(/\/trending\?category=7$/);
  await expect
    .poll(() => calls[calls.length - 1])
    .toEqual({ sort: "trending", tag: null, category: "7", language: null });
});

test("/trending supports the same filters", async ({ page }) => {
  const calls: Array<Record<string, string | null>> = [];
  await mockFeed(page, calls);

  await page.goto("/trending");
  const language = page.getByLabel("Filter by language");
  await expect(language).toBeEnabled();
  await language.selectOption("fr");
  await expect(page).toHaveURL(/\/trending\?language=fr$/);
  await expect
    .poll(() => calls[calls.length - 1])
    .toEqual({ sort: "trending", tag: null, category: null, language: "fr" });
});
