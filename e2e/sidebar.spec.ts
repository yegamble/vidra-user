import { expect, test, type Page } from "@playwright/test";

// Desktop left-navigation sidebar (design-system.md: sidebar on desktop/tablet).
// The feed + session calls are route-mocked (no backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;

const PRIMARY = [
  "Home",
  "Trending",
  "Subscriptions",
  "Library",
  "Playlists",
  "History",
  "Messages",
  "Studio",
];

test.beforeEach(async ({ page }) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
});

async function signIn(page: Page, role: "moderator" | "admin") {
  await page.route(LOGIN, (route) =>
    route.fulfill({
      json: {
        token: "acc",
        refresh_token: "ref",
        token_type: "Bearer",
        expires_in: 900,
        user: {
          id: "u1",
          username: "boss",
          email: "boss@example.test",
          role,
          email_verified: true,
          display_name: "Boss",
          bio: "",
          created_at: new Date().toISOString(),
        },
      },
    }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("the sidebar carries every primary destination and marks the active route", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  for (const label of PRIMARY) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  // Role-gated entries are absent for anonymous viewers.
  await expect(nav.getByRole("link", { name: "Moderation" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  // The hamburger is a phone-only control; at desktop it is not exposed.
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  // Active-route marking follows navigation.
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Playlists" }).click();
  await expect(page).toHaveURL(/\/playlists$/);
  await expect(nav.getByRole("link", { name: "Playlists" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the sidebar collapses to an icon rail, stays usable, and persists", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });

  // Keyboard-operable collapse toggle.
  const collapse = page.getByRole("button", { name: "Collapse sidebar" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.focus();
  await page.keyboard.press("Enter");

  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toBeVisible();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  // Collapsed links keep their accessible names (sr-only labels) and still work.
  const home = nav.getByRole("link", { name: "Home" });
  await expect(home).toBeVisible();
  await home.focus();
  await expect(home).toBeFocused();

  // The preference survives a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

test("moderators see the Moderation entry but not Admin", async ({ page }) => {
  await signIn(page, "moderator");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Moderation" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("admins see Moderation and Admin entries, and Admin lights up across /admin/*", async ({
  page,
}) => {
  await signIn(page, "admin");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Moderation" })).toBeVisible();
  const admin = nav.getByRole("link", { name: "Admin" });
  await expect(admin).toBeVisible();
  await page.route(/\/api\/v1\/admin\/users(\?|$)/, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await admin.click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(admin).toHaveAttribute("aria-current", "page");
});
