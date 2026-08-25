import { expect, test, type Page } from "@playwright/test";

const SEARCH = /\/api\/v1\/videos\/search/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const CONFIG_URL = /\/api\/v1\/videos\/config$/;
const SUGGEST = /\/api\/v1\/search\/suggestions/;

function suggestion(text: string, extra: Record<string, unknown> = {}) {
  return { text, type: "query", is_personal: false, ...extra };
}

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

// The facets live behind a "Filters" disclosure. Open it (unless arriving on a
// filtered URL, which opens it already) and wait for the config-driven selects
// to enable. Label queries are scoped through the a11y tree (getByRole("main"))
// so any streamed duplicate is never matched.
async function openSearchFilters(page: Page) {
  const main = page.getByRole("main");
  const toggle = main.getByRole("button", { name: /^Filters/ });
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(main.getByLabel("Category")).toBeEnabled({ timeout: 20_000 });
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

test("the header search box reflects the results-page query and runs a new one", async ({ page }) => {
  // There is no inline field anymore: the single header box IS the results-page
  // search. It reflects the URL's `q` and, on submit, re-navigates /search.
  await page.route(SEARCH, (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    route.fulfill({
      json: { query: q, videos: [video("v1", `Result for ${q}`)], limit: 20, offset: 0 },
    });
  });
  await page.goto("/search?q=go");
  const field = page.getByLabel("Search videos");
  await expect(field).toHaveValue("go");
  await expect(page.getByRole("heading", { name: "Result for go" })).toBeVisible();

  await field.fill("rust");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=rust/);
  await expect(page.getByRole("heading", { name: "Result for rust" })).toBeVisible();
});

test("clearing the header search box on the results page returns to the prompt", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics")], limit: 20, offset: 0 } }),
  );
  await page.goto("/search?q=go");
  const field = page.getByLabel("Search videos");
  await expect(field).toHaveValue("go");

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(field).toHaveValue("");
  await expect(page.getByText("Search for videos")).toBeVisible();
});

// Phone shell: the header shows a search icon that expands a full-screen sheet,
// and the Search tab lands on /search where the sheet auto-opens.
test.describe("mobile single search box", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the Search tab opens the sheet and a suggestion navigates to results", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(SUGGEST, (route) => {
      const q = new URL(route.request().url()).searchParams.get("q") ?? "";
      route.fulfill({ json: { query: q, suggestions: [suggestion("go basics"), suggestion("go generics")] } });
    });
    await page.route(SEARCH, (route) =>
      route.fulfill({ json: { query: "go basics", videos: [video("v1", "Go Basics")], limit: 20, offset: 0 } }),
    );

    await page.goto("/");
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/search$/);

    // The sheet auto-opens with the input focused (no inline field on the page).
    // Scope to the input's own name so the results-page filter <select>s (also
    // role=combobox) are never matched.
    const sheetInput = page.getByRole("combobox", { name: "Search videos" });
    await expect(sheetInput).toBeFocused();
    await sheetInput.fill("go");

    const listbox = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(listbox.getByRole("option").first()).toBeVisible();
    await listbox.getByRole("option", { name: /go basics/i }).click();

    await expect(page).toHaveURL(/\/search\?q=go\+basics/);
    await expect(page.getByRole("heading", { name: "Go Basics", exact: true })).toBeVisible();
  });

  test("the sheet's clear button empties the field", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(SUGGEST, (route) =>
      route.fulfill({ json: { query: "", suggestions: [] } }),
    );

    await page.goto("/");
    // Open the sheet from the header search icon button.
    await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
    const sheetInput = page.getByRole("combobox", { name: "Search videos" });
    await expect(sheetInput).toBeFocused();
    await sheetInput.fill("rust");
    await expect(sheetInput).toHaveValue("rust");

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(sheetInput).toHaveValue("");
  });
});

test("category/language filters narrow the search and land in the URL", async ({ page }) => {
  await mockConfig(page);
  const calls: Array<Record<string, string | null>> = [];
  await mockSearchCollecting(page, calls);

  await page.goto("/search?q=go");
  await openSearchFilters(page);
  const main = page.getByRole("main");

  await main.getByLabel("Category").selectOption("7");
  await expect(page).toHaveURL(/\/search\?q=go&category=7$/);
  // The panel is no longer remounted by the change it made, so it stays open
  // and the next facet is one click away rather than two.
  await expect(main.getByLabel("Category")).toHaveValue("7");

  await main.getByLabel("Language").selectOption("en");
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
  const main = page.getByRole("main");
  // Arriving with filters applied opens the panel: the badge says something is
  // narrowing the results, and the panel is where you find out what.
  await expect(main.getByRole("button", { name: "Filters, 2 active" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(main.getByLabel("Category")).toHaveValue("1");
  await expect(main.getByLabel("Language")).toHaveValue("fr");
  await expect
    .poll(() => calls[0])
    .toEqual({ q: "go", tag: null, category: "1", language: "fr" });
});

test("an active ?tag= filter shows a removable chip and narrows the search", async ({ page }) => {
  await mockConfig(page);
  const calls: Array<Record<string, string | null>> = [];
  await mockSearchCollecting(page, calls, 0);

  await page.goto("/search?q=go&tag=cats");
  const main = page.getByRole("main");
  // The arriving tag chip is visible WITHOUT opening the panel: it is a filter
  // the viewer did not set, so it must be visible and removable on sight.
  await expect(main.getByText("#cats")).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("No results")).toBeVisible();
  expect(calls[0]).toEqual({ q: "go", tag: "cats", category: null, language: null });

  await main.getByRole("link", { name: "Remove tag filter cats" }).click();
  await expect(page).toHaveURL(/\/search\?q=go$/);
  await expect(main.getByText("#cats")).toHaveCount(0);
  await expect
    .poll(() => calls[calls.length - 1])
    .toEqual({ q: "go", tag: null, category: null, language: null });
});

test("the sort / duration / published facets reach the endpoint as its own parameters", async ({
  page,
}) => {
  await mockConfig(page);
  const calls: URLSearchParams[] = [];
  await page.route(SEARCH, (route) => {
    const url = new URL(route.request().url());
    calls.push(url.searchParams);
    route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics")], total: 1, limit: 20, offset: 0 } });
  });

  await page.goto("/search?q=go");
  await openSearchFilters(page);
  const main = page.getByRole("main");

  await main.getByRole("button", { name: "Views" }).click();
  await expect(page).toHaveURL(/sort=-views/);
  await main.getByRole("button", { name: "4 – 10 minutes" }).click();
  await expect(page).toHaveURL(/duration=medium/);
  await main.getByRole("button", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/published=7d/);

  await expect.poll(() => calls.at(-1)?.get("sort")).toBe("-views");
  const last = calls.at(-1)!;
  // The bucket expands to the endpoint's SECONDS range, and to an RFC3339
  // instant computed at fetch time — the URL keeps the bucket, not the maths.
  expect(last.get("duration_min")).toBe("240");
  expect(last.get("duration_max")).toBe("600");
  expect(last.get("published_after")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("the tag lists apply on Enter and travel as one comma-separated parameter", async ({
  page,
}) => {
  await mockConfig(page);
  const calls: URLSearchParams[] = [];
  await page.route(SEARCH, (route) => {
    calls.push(new URL(route.request().url()).searchParams);
    route.fulfill({ json: { query: "go", videos: [], total: 0, limit: 20, offset: 0 } });
  });

  await page.goto("/search?q=go");
  await openSearchFilters(page);
  const field = page.getByRole("main").getByLabel("All of these tags");
  await field.fill("Ocean, reef");
  await field.press("Enter");

  await expect(page).toHaveURL(/tags_all=ocean%2Creef/);
  await expect.poll(() => calls.at(-1)?.get("tags_all_of")).toBe("ocean,reef");
});

test("the count is the server's total, and a capped one says so", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({
      json: { query: "go", videos: [video("v1", "Go Basics")], total: 42, limit: 20, offset: 0 },
    }),
  );
  await page.goto("/search?q=go");
  await expect(page.getByText(/42 results/)).toBeVisible();

  await page.route(SEARCH, (route) =>
    route.fulfill({
      json: {
        query: "go",
        videos: [video("v1", "Go Basics")],
        total: 1000,
        total_is_lower_bound: true,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/search?q=go");
  // A recall-capped count is a floor, not a figure — auto-scroll reaches that
  // boundary in seconds, so it must never be presented as an exact total.
  await expect(page.getByText(/1000\+ results/)).toBeVisible();
});

test("a full page with has_more false retires the pager instead of guessing", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({
      json: {
        query: "go",
        videos: Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Go Result ${i + 1}`)),
        total: 20,
        has_more: false,
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.goto("/search?q=go");
  await expect(page.getByRole("heading", { name: "Go Result 20" })).toBeVisible();
  // The old short-page guess (length === 20) would have left a Load more here
  // that fetched nothing.
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test.describe("result types", () => {
  const CHANNEL_SEARCH = /\/api\/v1\/search\/channels/;
  const ACCOUNT_SEARCH = /\/api\/v1\/search\/accounts/;

  test("the Channels tab hits its own endpoint and lands in the URL", async ({ page }) => {
    await page.route(SEARCH, (route) =>
      route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics")], total: 1, limit: 20, offset: 0 } }),
    );
    await page.route(CHANNEL_SEARCH, (route) =>
      route.fulfill({
        json: {
          query: "go",
          total: 2,
          limit: 20,
          offset: 0,
          channels: [
            {
              id: "c1",
              handle: "gophers",
              display_name: "Gophers",
              description: "",
              owner_id: "o1",
              follower_count: 5,
              has_avatar: false,
              has_banner: false,
              created_at: new Date().toISOString(),
            },
          ],
        },
      }),
    );

    await page.goto("/search?q=go");
    await page.getByRole("tab", { name: "Channels" }).click();

    await expect(page).toHaveURL(/\/search\?q=go&type=channels$/);
    await expect(page.getByRole("link", { name: /Gophers/ })).toBeVisible();
    await expect(page.getByText(/2 channels/)).toBeVisible();
    // Its own pagination and its own count — not a slice of the video results.
    await expect(page.getByRole("heading", { name: "Go Basics" })).toBeHidden();
  });

  test("the Accounts tab lists public accounts and links to their profiles", async ({ page }) => {
    await page.route(SEARCH, (route) =>
      route.fulfill({ json: { query: "ada", videos: [], total: 0, limit: 20, offset: 0 } }),
    );
    await page.route(ACCOUNT_SEARCH, (route) =>
      route.fulfill({
        json: {
          query: "ada",
          total: 1,
          limit: 20,
          offset: 0,
          accounts: [{ id: "u1", username: "ada", display_name: "Ada", bio: "builds things" }],
        },
      }),
    );

    await page.goto("/search?q=ada&type=accounts");

    await expect(page.getByRole("tab", { name: "Accounts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("link", { name: /Ada/ })).toHaveAttribute("href", "/users/ada");
    await expect(page.getByText(/1 account/)).toBeVisible();
  });

  test("the fediverse group still resolves a pasted handle on the videos tab", async ({ page }) => {
    await page.route(SEARCH, (route) =>
      route.fulfill({
        json: {
          query: "@movies@tube.example",
          videos: [],
          total: 0,
          limit: 20,
          offset: 0,
          remote: [
            {
              type: "channel",
              actor: {
                actor_url: "https://tube.example/video-channels/movies",
                handle: "movies@tube.example",
                domain: "tube.example",
              },
            },
          ],
        },
      }),
    );

    await page.goto("/search?q=%40movies%40tube.example");

    // A different question from the Channels tab (resolving a URL/handle), and
    // it keeps its own answer.
    await expect(page.getByText("From the fediverse")).toBeVisible();
    await expect(page.getByText("movies@tube.example", { exact: true })).toBeVisible();
  });
});

test.describe("browse_scroll_mode", () => {
  // 21 results across two pages, so there is always a next page to reach.
  async function mockPagedSearch(page: Page) {
    await page.route(SEARCH, (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") ?? "0");
      route.fulfill({
        json: {
          query: "go",
          videos:
            offset === 0
              ? Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Go Result ${i + 1}`))
              : [video("v20", "Go Result 21")],
          total: 21,
          has_more: offset === 0,
          limit: 20,
          offset,
        },
      });
    });
  }

  async function mockScrollMode(page: Page, mode: "button" | "auto") {
    await page.route(/\/api\/v1\/instance$/, (route) =>
      route.fulfill({
        json: {
          name: "Vidra",
          defaults: {
            feed_sort: "recent",
            feed_scope: "local",
            browse_scroll_mode: mode,
            landing_page: "home-recent",
            theme: "system",
            player_autoplay: false,
            miniature_prefer_author_display_name: false,
            publish: { privacy: "public", licence: 1, comment_policy: "enabled", download_enabled: true },
          },
        },
      }),
    );
  }

  test("the default keeps the manual button and observes nothing", async ({ page }) => {
    await mockScrollMode(page, "button");
    await mockPagedSearch(page);

    await page.goto("/search?q=go");
    await expect(page.getByRole("heading", { name: "Go Result 20" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();

    await page.getByTestId("load-more-sentinel").scrollIntoViewIfNeeded();
    // Scrolling to the end changes nothing: the operator did not ask for it.
    await expect(page.getByRole("heading", { name: "Go Result 21" })).toBeHidden();
  });

  test("auto fetches the next page as the sentinel comes into view", async ({ page }) => {
    await mockScrollMode(page, "auto");
    await mockPagedSearch(page);

    await page.goto("/search?q=go");
    await expect(page.getByRole("heading", { name: "Go Result 20" })).toBeVisible();
    // Auto-load carries the list, so the button steps aside.
    await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();

    await page.getByTestId("load-more-sentinel").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Go Result 21" })).toBeVisible();
    // The first page is still there: pages append, they do not replace.
    await expect(page.getByRole("heading", { name: "Go Result 1", exact: true })).toBeVisible();
  });

  test("auto mode brings the button back when a page fails, so the retry is clickable", async ({
    page,
  }) => {
    await mockScrollMode(page, "auto");
    await page.route(SEARCH, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? "0");
      if (offset > 0) return route.abort("failed");
      return route.fulfill({
        json: {
          query: "go",
          videos: Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Go Result ${i + 1}`)),
          total: 21,
          has_more: true,
          limit: 20,
          offset: 0,
        },
      });
    });

    await page.goto("/search?q=go");
    await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
    await page.getByTestId("load-more-sentinel").scrollIntoViewIfNeeded();

    // The sentinel has given up; the button is the only way on, and a keyboard
    // user never had another one.
    await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
    await expect(page.getByText("Could not load more results.")).toBeVisible();
  });
});
