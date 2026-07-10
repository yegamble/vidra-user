import { expect, test, type Locator, type Page } from "@playwright/test";

const FEED = /\/api\/v1\/videos(\?|$)/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config(\?|$)/;
const LIVE = /\/api\/v1\/live(\?|$)/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;

const sampleVideo = {
  id: "v1",
  channel_id: "c1",
  title: "A considered first frame",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 1200,
  has_thumbnail: false,
  duration_seconds: 83,
  channel_handle: "studio",
  channel_display_name: "Studio",
};

async function mockHome(page: Page) {
  await page.route(REFRESH, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthenticated", message: "signed out" } },
    }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({
      json: { videos: [sampleVideo], sort: "recent", limit: 20, offset: 0 },
    }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], languages: [], licenses: [] } }),
  );
  await page.route(LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the refreshed shell must not overflow horizontally").toBeLessThanOrEqual(1);
}

async function expectMinimumTargetSize(targets: Locator, expectedCount: number) {
  await expect(targets).toHaveCount(expectedCount);
  const sizes = await targets.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const size of sizes) {
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe("Apple HIG polish at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps hierarchy visible and primary touch targets at least 44px", async ({ page }) => {
    await mockHome(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Recent videos", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Fresh releases from creators across your community."),
    ).toBeVisible();

    const headerTargets = page
      .getByRole("banner")
      .getByRole("link")
      .filter({ hasText: /Vidra|Sign in/ });
    await expectMinimumTargetSize(headerTargets, 2);

    const sortTargets = page.getByRole("group", { name: "Sort videos" }).getByRole("button");
    await expectMinimumTargetSize(sortTargets, 3);

    const scopeTargets = page.getByRole("group", { name: "Feed scope" }).getByRole("button");
    await expectMinimumTargetSize(scopeTargets, 2);

    const filterTargets = page.getByRole("group", { name: "Filter videos" }).locator("select");
    await expect(page.getByLabel("Filter by category")).toBeEnabled();
    await expect(page.getByLabel("Filter by language")).toBeEnabled();
    await expectMinimumTargetSize(filterTargets, 2);

    const primary = page.getByRole("navigation", { name: "Primary" });
    await expect(primary).toBeVisible();
    const tabTargets = primary.locator("a,button");
    await expectMinimumTargetSize(tabTargets, 5);

    await expectNoHorizontalScroll(page);
    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalScroll(page);
  });
});

test.describe("Apple HIG polish at desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("uses a distinct elevated navigation layer without obscuring content", async ({ page }) => {
    await mockHome(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Recent videos", level: 1 })).toBeVisible();
    const headerMaterial = page.getByRole("banner").locator(".glass-chrome");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(headerMaterial).toHaveCount(1);
    await expect(sidebar).toHaveClass(/glass-chrome/);

    const chrome = await sidebar.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        radius: Number.parseFloat(style.borderRadius),
        background: style.backgroundColor,
      };
    });
    expect(chrome.radius).toBeGreaterThanOrEqual(20);
    expect(chrome.background).not.toBe("rgba(0, 0, 0, 0)");

    await expect(page.getByRole("heading", { name: sampleVideo.title })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
