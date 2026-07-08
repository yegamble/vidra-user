import { expect, test, type Page } from "@playwright/test";

// Desktop left-navigation sidebar (design-system.md: sidebar on desktop/tablet).
// The feed + session calls are route-mocked (no backend in `npm run ci`).
const FEED_URL = /\/api\/v1\/videos(\?|$)/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;

// Desktop template (backport W0.2): exactly these primary destinations, in this
// order, then a FOLLOWING group. Playlists is intentionally NOT here — it is
// reached from the Library page.
const PRIMARY = [
  "Home",
  "Trending",
  "Subscriptions",
  "Library",
  "History",
  "Messages",
  "Studio",
];
const SUBSCRIPTIONS = /\/api\/v1\/me\/subscriptions(\?|$)/;

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
  // Playlists is no longer a primary destination (reached from Library instead).
  await expect(nav.getByRole("link", { name: "Playlists" })).toHaveCount(0);
  // Active-route marking follows navigation.
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page).toHaveURL(/\/subscriptions$/);
  await expect(nav.getByRole("link", { name: "Subscriptions" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the Library page links to Playlists (the sidebar no longer does)", async ({ page }) => {
  await page.goto("/library");
  const playlists = page.getByRole("main").getByRole("link", { name: "Playlists" });
  await expect(playlists).toBeVisible();
  await playlists.click();
  await expect(page).toHaveURL(/\/playlists$/);
});

test("the FOLLOWING group lists the channels the signed-in user follows", async ({ page }) => {
  await page.route(SUBSCRIPTIONS, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "ch1",
            owner_id: "o1",
            handle: "grade_house",
            display_name: "Grade House",
            description: "",
            follower_count: 1200,
            created_at: new Date().toISOString(),
            has_avatar: false,
            has_banner: false,
            followed_at: new Date().toISOString(),
          },
          {
            id: "ch2",
            owner_id: "o2",
            handle: "north_loop",
            display_name: "North Loop",
            description: "",
            follower_count: 42,
            created_at: new Date().toISOString(),
            has_avatar: false,
            has_banner: false,
            followed_at: new Date().toISOString(),
          },
        ],
        limit: 15,
        offset: 0,
      },
    }),
  );
  await signIn(page, "moderator");
  const nav = page.getByRole("navigation", { name: "Primary" });
  // The FOLLOWING channels appear as links to their channel pages.
  const grade = nav.getByRole("link", { name: "Grade House" });
  await expect(grade).toBeVisible();
  await expect(nav.getByRole("link", { name: "North Loop" })).toBeVisible();
  await expect(grade).toHaveAttribute("href", "/channels/grade_house");
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

test("admins reach the standalone admin console, which steps in for the app sidebar on /admin/*", async ({
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
  // The console's Queues badge reads the open-reports count on mount — keep it
  // hermetic (empty) so nothing depends on a real backend.
  await page.route(/\/api\/v1\/admin\/reports(\?|$)/, (route) =>
    route.fulfill({ json: { reports: [], limit: 100, offset: 0 } }),
  );
  await admin.click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  // DR12: on /admin the global app sidebar steps aside for the dedicated desktop
  // admin console rail, which lights its Users destination as the current page.
  const consoleRail = page.getByRole("navigation", { name: "Admin console" });
  await expect(consoleRail).toBeVisible();
  await expect(consoleRail.getByRole("link", { name: "Users" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The primary app sidebar is no longer the admin's left rail here.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
});
