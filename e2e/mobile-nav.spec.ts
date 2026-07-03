import { expect, test } from "@playwright/test";

// Phone-viewport coverage for the collapsed header navigation: the inline nav
// links give way to a hamburger button whose menu handles focus, Escape,
// outside-click, and route-change dismissal. The feed call is route-mocked
// (no backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
});

test("nav links collapse behind the hamburger on phones", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Menu" });
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  // The inline desktop nav is hidden at this breakpoint and the menu is closed,
  // so no nav landmark (and no Playlists link) is exposed.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Playlists" })).toHaveCount(0);
});

test("opening the menu moves focus in; navigating closes it and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Menu" });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("navigation", { name: "Primary" });
  await expect(menu).toBeVisible();
  // Focus lands on the first menu item.
  await expect(menu.getByRole("link", { name: "Home" })).toBeFocused();
  // All primary destinations and the auth control are reachable in the menu.
  await expect(menu.getByRole("link", { name: "Studio" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Sign in" })).toBeVisible();
  // Following a link navigates, closes the menu, and returns focus to the toggle.
  await menu.getByRole("link", { name: "Playlists" }).click();
  await expect(page).toHaveURL(/\/playlists$/);
  await expect(page.locator("#mobile-menu")).toHaveCount(0);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
});

test("Escape closes the menu and restores focus to the toggle", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Menu" });
  await menuButton.click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobile-menu")).toHaveCount(0);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
});

test("clicking outside the menu dismisses it", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Menu" });
  await menuButton.click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page.getByRole("heading", { name: "Recent videos" }).click();
  await expect(page.locator("#mobile-menu")).toHaveCount(0);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
});
