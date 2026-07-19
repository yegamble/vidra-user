import { expect, test } from "@playwright/test";

// Phone-viewport coverage for the bottom tab bar (design-system.md: mobile
// bottom tabs; desktop/tablet sidebar; no hamburger). The five primary
// destinations — Home, Search, Create, Inbox, Library — are always visible on
// phones, active tabs carry aria-current, and the bar disappears at desktop
// widths where the sidebar takes over. The feed call is route-mocked (no
// backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
});

test("phones show the bottom tab bar, not a hamburger or the sidebar", async ({ page }) => {
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  await expect(tabBar).toBeVisible();
  // The four navigating destinations are links…
  for (const name of ["Home", "Search", "Inbox", "Library"]) {
    await expect(tabBar.getByRole("link", { name })).toBeVisible();
  }
  // …and Create is a button (it opens the Create bottom sheet, it does not navigate).
  await expect(tabBar.getByRole("button", { name: "Create" })).toBeVisible();
  // No hamburger button, and sidebar-only destinations are not exposed.
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Playlists" })).toHaveCount(0);
});

test("phones show the large-title 'Vidra' header brand in the compact top row", async ({
  page,
}) => {
  // The mobile app template pairs the bottom tab bar with a compact top row
  // whose large page title is the "Vidra" wordmark (backport W0.3). It stays a
  // link to home (not a heading) so page landmarks/headings are unaffected.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Vidra" })).toBeVisible();
});

test("the active tab is marked with aria-current and follows navigation", async ({ page }) => {
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  await expect(tabBar.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabBar.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(tabBar.getByRole("link", { name: "Search" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(tabBar.getByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the Library tab routes to its destination", async ({ page }) => {
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  await tabBar.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(tabBar.getByRole("link", { name: "Library" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the Create tab opens the Create sheet, whose rows lead into the studio", async ({
  page,
}) => {
  await page.goto("/");
  const tabBar = page.getByRole("navigation", { name: "Primary" });
  const create = tabBar.getByRole("button", { name: "Create" });
  await expect(create).toHaveAttribute("aria-expanded", "false");
  await create.click();

  // A dialog labeled "Create" with the entry points (Upload video / Go live /
  // New channel / Open Studio) — none is stubbed; each deep-links into a studio
  // surface that auto-opens the flow.
  const sheet = page.getByRole("dialog", { name: "Create" });
  await expect(sheet).toBeVisible();
  await expect(create).toHaveAttribute("aria-expanded", "true");
  await expect(sheet.getByRole("link", { name: /Upload video/ })).toHaveAttribute(
    "href",
    "/studio/content?upload=1",
  );
  await expect(sheet.getByRole("link", { name: /Go live/ })).toHaveAttribute(
    "href",
    "/studio/live?new=1",
  );
  await expect(sheet.getByRole("link", { name: /New channel/ })).toHaveAttribute(
    "href",
    "/studio/channel?create=1",
  );

  await sheet.getByRole("link", { name: /Open Studio/ }).click();
  await expect(page).toHaveURL(/\/studio$/);
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the bottom tab bar is hidden at desktop widths", async ({ page }) => {
    await page.goto("/");
    // The Inbox tab exists only in the tab bar, so it must not be exposed.
    await expect(page.getByRole("link", { name: "Inbox" })).toHaveCount(0);
    // Primary navigation is the sidebar (it carries the full destination set) —
    // e.g. History, a primary destination the bottom tab bar does not surface.
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "History" }),
    ).toBeVisible();
  });
});
