import { expect, test, type Locator, type Page } from "@playwright/test";

const FEED = /\/api\/v1\/videos(\?|$)/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config(\?|$)/;
const LIVE = /\/api\/v1\/live(\?|$)/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const INSTANCE = /\/api\/v1\/instance$/;

const standaloneAuthRoutes = [
  { path: "/login", heading: "Vidra" },
  { path: "/signup", heading: "Create your account" },
  { path: "/reset-password", heading: "Reset your password" },
  { path: "/reset-password/confirm", heading: "Choose a new password" },
  { path: "/verify-email/confirm", heading: "Verify your email" },
] as const;

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

const sampleVideos = Array.from({ length: 12 }, (_, index) => ({
  ...sampleVideo,
  id: `v${index + 1}`,
  title: index === 0 ? sampleVideo.title : `A considered frame ${index + 1}`,
}));

async function mockHome(page: Page) {
  await page.route(REFRESH, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthenticated", message: "signed out" } },
    }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({
      json: { videos: sampleVideos, sort: "recent", limit: 20, offset: 0 },
    }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], languages: [], licenses: [] } }),
  );
  await page.route(LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));
  // The /about destination needs the instance details to render (otherwise the
  // About surface shows its error state instead of the "About" heading).
  await page.route(INSTANCE, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        description: "",
        software: { name: "vidra", version: "0.1.0" },
        registration_enabled: true,
        oauth_providers: [],
      },
    }),
  );
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

async function mockSignedOut(page: Page) {
  await page.route(REFRESH, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthenticated", message: "signed out" } },
    }),
  );
  await page.route(INSTANCE, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        description: "",
        software: { name: "vidra", version: "0.1.0" },
        registration_enabled: true,
        oauth_providers: [],
      },
    }),
  );
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

  test("keeps the final feed card above the floating tab bar", async ({ page }) => {
    await mockHome(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: sampleVideos.at(-1)!.title })).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

    const lastHeading = page.getByRole("heading", { name: sampleVideos.at(-1)!.title });
    const lastCard = page.getByRole("main").locator("li").filter({ has: lastHeading });
    const tabBar = page.getByRole("navigation", { name: "Primary" });
    await expect(lastCard).toHaveCount(1);

    const [cardBox, tabBox] = await Promise.all([lastCard.boundingBox(), tabBar.boundingBox()]);
    expect(cardBox).not.toBeNull();
    expect(tabBox).not.toBeNull();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
  });
});

test.describe("Apple HIG polish at desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keeps primary destinations on one responsive page canvas", async ({ page }) => {
    await mockHome(page);

    const destinations = [
      { path: "/", heading: "Recent videos" },
      { path: "/trending", heading: "Trending videos" },
      { path: "/subscriptions", heading: "Subscriptions" },
      { path: "/library", heading: "Library" },
      { path: "/history", heading: "History" },
      { path: "/messages", heading: "Messages" },
      { path: "/studio", heading: "Studio" },
      { path: "/about/instance/home", heading: "About" },
    ] as const;

    let baseline: { left: number; right: number; paddingLeft: number; paddingRight: number } | null =
      null;

    for (const destination of destinations) {
      await page.goto(destination.path);
      await expect(
        page.getByRole("heading", { name: destination.heading, level: 1 }),
      ).toBeVisible();

      const shell = page.locator('main[data-page-shell=""]');
      await expect(shell).toHaveCount(1);
      const geometry = await shell.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          right: rect.right,
          paddingLeft: Number.parseFloat(style.paddingLeft),
          paddingRight: Number.parseFloat(style.paddingRight),
        };
      });

      baseline ??= geometry;
      expect(Math.abs(geometry.left - baseline.left), destination.path).toBeLessThanOrEqual(1);
      expect(Math.abs(geometry.right - baseline.right), destination.path).toBeLessThanOrEqual(1);
      expect(geometry.paddingLeft, destination.path).toBe(baseline.paddingLeft);
      expect(geometry.paddingRight, destination.path).toBe(baseline.paddingRight);
    }
  });

  test("uses a distinct elevated navigation layer without obscuring content", async ({ page }) => {
    await mockHome(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Recent videos", level: 1 })).toBeVisible();
    // Two boxes of the one chrome material: the header is the full-bleed box
    // (edge to edge, no radius, a single bottom hairline instead of a ring +
    // shadow); the sidebar is the floating box (rounded, inset from the edge).
    const banner = page.getByRole("banner");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(banner).toHaveClass(/glass-chrome/);
    await expect(banner).toHaveClass(/glass-chrome-flush/);
    await expect(sidebar).toHaveClass(/glass-chrome/);

    const header = await banner.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      // Measure against the body, not documentElement.clientWidth: the page
      // reserves a scrollbar track (`scrollbar-gutter: stable`), so where
      // scrollbars are classic (Linux CI) clientWidth runs ~15px wider than the
      // box the layout actually gets, while overlay scrollbars (macOS) make the
      // two identical. The body is the same reference on both.
      const body = document.body.getBoundingClientRect();
      return {
        radius: Number.parseFloat(style.borderRadius),
        borderBottom: Number.parseFloat(style.borderBottomWidth),
        background: style.backgroundColor,
        left: rect.left,
        width: rect.width,
        bodyLeft: body.left,
        bodyWidth: body.width,
      };
    });
    expect(header.radius).toBe(0);
    expect(header.borderBottom).toBeGreaterThan(0);
    expect(header.background).not.toBe("rgba(0, 0, 0, 0)");
    // The material itself reaches both edges — the old inset toolbar carried it
    // on an inner div with a gutter, so this is what the flush box adds.
    expect(header.left).toBe(header.bodyLeft);
    expect(header.width).toBe(header.bodyWidth);

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

  test("keeps sticky chrome separated and the collapsed rail free of overflow", async ({
    page,
  }) => {
    await mockHome(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: sampleVideos.at(-1)!.title })).toBeVisible();

    const banner = page.getByRole("banner");
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    const [initialBannerBox, initialSidebarBox] = await Promise.all([
      banner.boundingBox(),
      sidebar.boundingBox(),
    ]);
    expect(initialBannerBox).not.toBeNull();
    expect(initialSidebarBox).not.toBeNull();
    const initialGap =
      initialSidebarBox!.y - (initialBannerBox!.y + initialBannerBox!.height);

    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const [bannerBox, sidebarBox] = await Promise.all([banner.boundingBox(), sidebar.boundingBox()]);
    expect(bannerBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    expect(bannerBox!.y).toBeGreaterThanOrEqual(0);
    expect(bannerBox!.y).toBeLessThanOrEqual(1);
    const scrolledGap = sidebarBox!.y - (bannerBox!.y + bannerBox!.height);
    expect(scrolledGap).toBeGreaterThanOrEqual(8);
    expect(
      Math.abs(scrolledGap - initialGap),
      "header/sidebar gap must not change on scroll",
    ).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await expect(sidebar).toHaveCSS("width", "64px");
    const overflow = await sidebar.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

for (const viewport of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`presents auth as focused standalone flows at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockSignedOut(page);

    for (const route of standaloneAuthRoutes) {
      await page.goto(route.path);

      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByRole("banner")).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
      const homeLink = page
        .getByRole("main")
        .getByRole("link", { name: "Vidra", exact: true });
      await expect(homeLink).toHaveAttribute("href", "/");
      await expectMinimumTargetSize(homeLink, 1);
      await expectNoHorizontalScroll(page);
    }
  });
}
