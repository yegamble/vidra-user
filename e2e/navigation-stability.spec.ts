import { expect, test, type Page } from "@playwright/test";

const FEED = /\/api\/v1\/videos(\?|$)/;
const SEARCH = /\/api\/v1\/videos\/search/;
const HOME_RECOMMENDATIONS = /\/api\/v1\/recommendations\/home/;
const LIVE = /\/api\/v1\/live(\?|$)/;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockStableHome(page: Page) {
  await page.route(FEED, (route) =>
    route.fulfill({
      json: {
        videos: [video("feed-1", "Stable feed card")],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(HOME_RECOMMENDATIONS, (route) =>
    route.fulfill({ json: { items: [], personalized: false, source: "fallback" } }),
  );
  await page.route(LIVE, (route) =>
    route.fulfill({ json: { live_streams: [], limit: 20, offset: 0 } }),
  );
}

test("a slow Home → Login navigation never paints the catch-all video loading page", async ({
  page,
}) => {
  await mockStableHome(page);

  // Hold the destination RSC request long enough that the former root
  // loading.tsx was guaranteed to mount. This covers prefetch and click-time
  // requests; API login calls use /api/v1/auth/login and do not match.
  await page.route("**/login**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/login" && request.headers().rsc === "1") {
      await delay(700);
    }
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stable feed card" })).toBeVisible();

  await page.evaluate(() => {
    const state = window as typeof window & {
      __sawCatchAllRouteLoader?: boolean;
      __routeLoaderObserver?: MutationObserver;
    };
    state.__sawCatchAllRouteLoader = false;
    const inspect = () => {
      if (document.querySelector('main[aria-busy="true"]')) {
        state.__sawCatchAllRouteLoader = true;
      }
    };
    state.__routeLoaderObserver = new MutationObserver(inspect);
    state.__routeLoaderObserver.observe(document.body, { childList: true, subtree: true });
    inspect();
  });

  await page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  const sawCatchAll = await page.evaluate(() => {
    const state = window as typeof window & {
      __sawCatchAllRouteLoader?: boolean;
      __routeLoaderObserver?: MutationObserver;
    };
    state.__routeLoaderObserver?.disconnect();
    return state.__sawCatchAllRouteLoader === true;
  });
  expect(sawCatchAll).toBe(false);
});

test("late home recommendations do not move the primary feed", async ({ page }) => {
  await page.route(FEED, (route) =>
    route.fulfill({
      json: {
        videos: Array.from({ length: 9 }, (_, index) =>
          video(`feed-${index}`, `Stable video ${index + 1}`),
        ),
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(LIVE, (route) =>
    route.fulfill({ json: { live_streams: [], limit: 20, offset: 0 } }),
  );
  await page.route(HOME_RECOMMENDATIONS, async (route) => {
    await delay(800);
    await route.fulfill({
      json: {
        items: [{ ...video("recommended-1", "Late recommendation"), reason: "trending" }],
        personalized: false,
        source: "fallback",
      },
    });
  });

  await page.goto("/");
  const firstCard = page.getByRole("heading", { name: "Stable video 1", exact: true });
  await expect(firstCard).toBeVisible();
  const before = await firstCard.boundingBox();
  expect(before).not.toBeNull();

  await expect(page.getByRole("heading", { name: "Trending now" })).toBeVisible();
  const after = await firstCard.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.y - before!.y), "late rails must not displace feed cards").toBeLessThanOrEqual(1);
});

test("search loading rows preserve the final result geometry", async ({ page }) => {
  await page.route(SEARCH, async (route) => {
    await delay(700);
    await route.fulfill({
      json: {
        query: "steady",
        videos: [video("result-1", "Steady result")],
        limit: 20,
        offset: 0,
      },
    });
  });

  await page.goto("/search?q=steady");
  const loading = page.getByTestId("search-results-loading");
  await expect(loading).toBeVisible();
  const skeletonRows = page.getByTestId("search-result-skeleton");
  await expect(skeletonRows).toHaveCount(5);
  const skeletonTop = await skeletonRows.first().boundingBox();
  expect(skeletonTop).not.toBeNull();

  await expect(page.getByRole("heading", { name: "Steady result" })).toBeVisible();
  const resultTop = await page.getByTestId("search-result-row").boundingBox();
  expect(resultTop).not.toBeNull();
  expect(
    Math.abs(resultTop!.y - skeletonTop!.y),
    "the first result should replace its skeleton in place",
  ).toBeLessThanOrEqual(1);
});

test("About uses a stable page-shaped fallback, never a centered spinner", async ({ page }) => {
  await page.route(/\/api\/v1\/instance$/, async (route) => {
    await delay(500);
    await route.fulfill({
      json: {
        name: "Stable Vidra",
        description: "A stable instance.",
        short_description: "A stable instance.",
        registration_enabled: true,
        registration_requires_approval: false,
        oauth_providers: [],
        federation_enabled: true,
        contact_form_enabled: false,
        categories: [],
        moderator_languages: [],
        social_links: {},
        features: {},
      },
    });
  });
  await page.route(/\/api\/v1\/instance\/about$/, async (route) => {
    await delay(500);
    await route.fulfill({
      json: {
        description: "",
        terms: "",
        code_of_conduct: "",
        moderation_info: "",
        administrator_info: "",
        creation_reason: "",
        maintenance_lifetime: "",
        business_model: "",
        hardware_info: "",
        support_text: "",
      },
    });
  });

  await page.goto("/about/instance/home");
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  // When the production build already has a server snapshot, the browser mocks
  // are intentionally unnecessary and the real instance name may differ.
  await expect(page.locator('section[aria-label$=" identity"]')).toBeVisible();
  await expect(page.locator(".animate-spin")).toHaveCount(0);
});
