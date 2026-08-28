import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Mocked search & discovery coverage (search-service W4): the autocomplete
// combobox, the home recommendation rail, the account "Search & recommendations"
// settings page, and the admin search section. Route-mocked like the rest of the
// suite; a real backend is not running in `npm run ci`. End-to-end behaviour
// against a live stack lives in e2e-backed/search-discovery.spec.ts (skipped
// until vidra-core's search endpoints merge to main).
const SUGGEST = /\/api\/v1\/search\/suggestions/;
const HOME_RECS = /\/api\/v1\/recommendations\/home/;
const SEARCH = /\/api\/v1\/videos\/search/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const HISTORY = /\/api\/v1\/me\/search-history/;
const HISTORY_ENTRY = /\/api\/v1\/me\/search-history\/.+/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const ME = /\/api\/v1\/auth\/me$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SETTINGS = /\/api\/v1\/admin\/instance-settings$/;
const DOCS = /\/api\/v1\/admin\/instance-documents\/(homepage|custom_css|custom_js)$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const INSTANCE = /\/api\/v1\/instance$/;

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 42,
    has_thumbnail: false,
    duration_seconds: 90,
  };
}

function suggestion(text: string, extra: Record<string, unknown> = {}) {
  return { text, type: "query", is_personal: false, ...extra };
}

async function abortMedia(page: Page) {
  await page.route(/\/(avatar|thumbnail|banner|original)/, (route) => route.abort());
}

function userSession(overrides: Record<string, unknown> = {}) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "ada",
      email: "ada@example.test",
      role: "user",
      email_verified: true,
      display_name: "Ada",
      bio: "",
      created_at: new Date().toISOString(),
      search_history_enabled: true,
      personalized_search_enabled: true,
      personalized_recommendations_enabled: false,
      ...overrides,
    },
  };
}

async function expectNoSevereViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const dump = severe.map((v) => ({ id: v.id, impact: v.impact, help: v.help }));
  expect(dump, "axe found serious/critical accessibility violations").toEqual([]);
}

test.describe("autocomplete combobox", () => {
  test("typing shows suggestions; keyboard-selecting one navigates to results", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(HOME_RECS, (route) =>
      route.fulfill({ json: { items: [], personalized: false, source: "fallback" } }),
    );
    await page.route(SUGGEST, (route) => {
      const q = new URL(route.request().url()).searchParams.get("q") ?? "";
      route.fulfill({
        json: {
          query: q,
          suggestions: [suggestion("golang tutorials"), suggestion("go generics")],
        },
      });
    });
    await page.route(SEARCH, (route) =>
      route.fulfill({
        json: { query: "golang tutorials", videos: [video("v1", "Golang 101")], limit: 20, offset: 0 },
      }),
    );

    await page.goto("/");
    const box = page.getByLabel("Search videos");
    await box.fill("go");

    const listbox = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option")).toHaveCount(2);

    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=golang\+tutorials/);
    await expect(page.getByRole("heading", { name: "Golang 101" })).toBeVisible();
  });

  test("a degraded (empty) suggestion response still lets the raw query submit", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(HOME_RECS, (route) =>
      route.fulfill({ json: { items: [], personalized: false, source: "fallback" } }),
    );
    await page.route(SUGGEST, (route) =>
      route.fulfill({ json: { query: "", suggestions: [] } }),
    );
    await page.route(SEARCH, (route) =>
      route.fulfill({ json: { query: "rust", videos: [video("v1", "Rust Basics")], limit: 20, offset: 0 } }),
    );

    await page.goto("/");
    const box = page.getByLabel("Search videos");
    await box.fill("rust");
    // No popup churns up on an empty response.
    await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeHidden();
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=rust/);
    await expect(page.getByRole("heading", { name: "Rust Basics" })).toBeVisible();
  });

  test("a history suggestion can be removed inline", async ({ page }) => {
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(HOME_RECS, (route) =>
      route.fulfill({ json: { items: [], personalized: false, source: "fallback" } }),
    );
    await page.route(SUGGEST, (route) =>
      route.fulfill({
        json: {
          query: "pa",
          suggestions: [
            suggestion("past query", { type: "history", is_personal: true }),
            suggestion("pastel art"),
          ],
        },
      }),
    );
    let deleted: string | null = null;
    await page.route(HISTORY_ENTRY, (route) => {
      deleted = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/");
    const box = page.getByLabel("Search videos");
    await box.fill("pa");
    // Scope option queries to the suggestions listbox — the page's native
    // <select> filters also expose role="option" ("All").
    const listbox = page.getByRole("listbox", { name: "Search suggestions" });
    await expect(listbox.getByRole("option")).toHaveCount(2);

    // The remove × reveals on hover / when the row is the active descendant.
    await listbox.getByRole("option").first().hover();
    await page.getByTitle(/Remove .*past query.* from your search history/).click();
    await expect(listbox.getByRole("option")).toHaveCount(1);
    expect(deleted).toBe("past query");
    // Removing must not navigate away.
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("home recommendation rail", () => {
  test("renders a 'For you' rail when the server reports personalization", async ({ page }) => {
    await abortMedia(page);
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(HOME_RECS, (route) =>
      route.fulfill({
        json: {
          items: [{ ...video("v1", "Made for Ada"), reason: "subscribed" }],
          personalized: true,
          source: "search",
        },
      }),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "For you" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Made for Ada" })).toBeVisible();
  });

  test("renders a 'Trending now' rail for the non-personalized fallback + passes axe", async ({
    page,
  }) => {
    await abortMedia(page);
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(HOME_RECS, (route) =>
      route.fulfill({
        json: {
          items: [{ ...video("v1", "Trending Clip"), reason: "trending" }],
          personalized: false,
          source: "fallback",
        },
      }),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Trending now" })).toBeVisible();
    await expectNoSevereViolations(page);
  });
});

test.describe("account search settings", () => {
  async function signIn(page: Page) {
    await page.route(LOGIN, (route) => route.fulfill({ json: userSession() }));
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
    await page.goto("/login");
    await page.getByLabel("Email").fill("ada@example.test");
    await page.getByLabel("Password").fill("supersecret");
    await page.getByRole("button", { name: "Sign in" }).click();
    // The account-menu dropdown trigger is the signed-in signal in the redesigned
    // header (the profile/settings/sign-out links live inside it).
    await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  }

  test("toggles persist via PATCH and the history list renders + passes axe", async ({ page }) => {
    await signIn(page);
    await page.route(HISTORY, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({
        json: {
          entries: [
            { query: "cats", normalized_query: "cats", last_used_at: new Date().toISOString(), use_count: 3 },
          ],
          limit: 100,
          offset: 0,
        },
      });
    });
    let patchBody: unknown = null;
    await page.route(ME, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...userSession().user, personalized_recommendations_enabled: true } });
    });

    // Client-side nav keeps the in-memory session: open the account menu →
    // Settings → the "Search & recommendations" row.
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Manage search and recommendations" }).click();
    await expect(page.getByRole("heading", { name: "Search & recommendations" })).toBeVisible();

    // History renders (not a fake-empty state).
    await expect(page.getByText("cats")).toBeVisible();

    // A single-field PATCH persists a toggle.
    await page.getByLabel("Personalize my recommendations").check();
    await expect(page.getByText("Saved.")).toBeVisible();
    expect(patchBody).toEqual({ personalized_recommendations_enabled: true });

    await expectNoSevereViolations(page);
  });
});

test.describe("admin search section", () => {
  const searchSettings = {
    settings: [
      {
        key: "search_mode",
        type: "enum",
        value: "simple",
        default: "simple",
        overridden: false,
        options: ["simple", "advanced"],
        page: "advanced",
        section: "search",
      },
      { key: "search_suggestions_enabled", type: "bool", value: true, default: true, overridden: false, page: "advanced", section: "search" },
      { key: "personalized_search_enabled", type: "bool", value: true, default: true, overridden: false, page: "advanced", section: "search" },
      { key: "personalized_recommendations_enabled", type: "bool", value: true, default: true, overridden: false, page: "advanced", section: "search" },
      { key: "search_history_enabled", type: "bool", value: true, default: true, overridden: false, page: "advanced", section: "search" },
      { key: "search_event_retention_days", type: "int", value: 90, default: 90, overridden: false, page: "advanced", section: "search" },
      { key: "search_min_query_user_count", type: "int", value: 3, default: 3, overridden: false, page: "advanced", section: "search" },
    ],
  };

  async function signInAdmin(page: Page) {
    await page.route(LOGIN, (route) =>
      route.fulfill({ json: { ...userSession(), user: { ...userSession().user, role: "admin", username: "boss" } } }),
    );
    await page.route(FEED, (route) =>
      route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
    );
    await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
    await page.route(INSTANCE, (route) =>
      route.fulfill({
        json: {
          name: "Vidra",
          federation_enabled: true,
          registration_enabled: true,
          features: { uploads: true, imports: true, live: false, comments: true },
        },
      }),
    );
    await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
    await page.route(VIDEO_CONFIG, (route) =>
      route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
    );
    await page.route(DOCS, (route) => {
      const name = route.request().url().split("/").pop() ?? "";
      return route.fulfill({ json: { name, body: "", hash: "" } });
    });
    await page.goto("/login");
    await page.getByLabel("Email").fill("ada@example.test");
    await page.getByLabel("Password").fill("supersecret");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  }

  test("renders the search section on Advanced with the enum control and saves a change", async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.route(SETTINGS, (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: searchSettings });
      return route.fallback();
    });

    await page.getByRole("link", { name: "Admin", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Admin console" })
      .getByRole("link", { name: "Instance" })
      .click();
    await page.getByRole("navigation", { name: "Configuration pages" }).getByRole("link", { name: "Advanced" }).click();
    await expect(page).toHaveURL(/\/admin\/config\/advanced$/);

    await expect(page.getByRole("heading", { name: "Search & recommendations" })).toBeVisible();
    const mode = page.getByRole("group", { name: "Ranking mode" });
    await expect(mode.getByRole("button", { name: "Simple" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("switch", { name: "Autocomplete suggestions" })).toBeVisible();

    // Flip the enum to Advanced and save just this section's change.
    let patchBody: unknown = null;
    await page.route(SETTINGS, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patchBody = route.request().postDataJSON();
      return route.fulfill({
        json: {
          settings: searchSettings.settings.map((s) =>
            s.key === "search_mode" ? { ...s, value: "advanced", overridden: true } : s,
          ),
        },
      });
    });
    await mode.getByRole("button", { name: "Advanced" }).click();
    await page.getByRole("button", { name: "Save Search & recommendations" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    expect(patchBody).toEqual({ search_mode: "advanced" });
  });
});
