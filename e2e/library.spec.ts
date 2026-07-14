import { expect, test, type Page } from "@playwright/test";

// Mocked Library-hub coverage (a real backend is not running in `npm run ci`;
// the persistence round-trips are proven in the backed history/playlists/save
// specs). The hub composes three real endpoints: /me/history, /me/playlists,
// and /me/saved.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const HISTORY = /\/api\/v1\/me\/history(\?|$)/;
const PLAYLISTS = /\/api\/v1\/me\/playlists$/;
const SAVED = /\/api\/v1\/me\/saved(\?|$)/;

function video(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    channel_handle: "aurora-lab",
    channel_display_name: "Aurora Lab",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 1,
    has_thumbnail: false,
  };
}

function historyItem(id: string, title: string, position: number, duration?: number) {
  return {
    ...video(id, title),
    ...(duration !== undefined ? { duration_seconds: duration } : {}),
    position_seconds: position,
    watched_at: new Date().toISOString(),
  };
}

function playlist(id: string, title: string, count: number, visibility = "private") {
  return {
    id,
    title,
    description: "",
    visibility,
    video_count: count,
    has_thumbnail: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

test("the library hub shows the history rail, playlist rows, and saved rows", async ({ page }) => {
  await signIn(page);
  await page.route(HISTORY, (route) =>
    route.fulfill({
      json: {
        videos: [
          historyItem("h1", "Grading session", 95, 200),
          historyItem("h2", "Alps field diary", 0, 400),
        ],
        limit: 12,
        offset: 0,
      },
    }),
  );
  await page.route(PLAYLISTS, (route) =>
    route.fulfill({ json: { playlists: [playlist("p1", "Watch later", 6)] } }),
  );
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [video("s1", "Saved clip")], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  const main = page.getByRole("main");

  // History rail: heading, a "See all" → /history, a resume-progress bar filled
  // to 95/200 = 47.5% on the item with a saved position (and none on the 0).
  await expect(main.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(main.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/history");
  const bars = main.locator("[data-resume-progress]");
  await expect(bars).toHaveCount(1);
  await expect(bars).toHaveAttribute("data-resume-progress", "47.5");
  const historyLinks = main.getByRole("link", { name: "Grading session" });
  await expect(historyLinks).toHaveCount(2);
  await expect(historyLinks.first()).toHaveAttribute("href", "/videos/h1");
  await expect(historyLinks.last()).toHaveAttribute("href", "/videos/h1");

  // Playlists row: name, "N videos · Privacy", → /playlists/{id}.
  await expect(main.getByText("6 videos · Private")).toBeVisible();
  await expect(main.getByRole("link", { name: /Watch later/ })).toHaveAttribute(
    "href",
    "/playlists/p1",
  );

  // Saved row: the title is a heading linking to the watch page.
  await expect(main.getByRole("heading", { name: "Saved clip" })).toBeVisible();
});

test("the library exposes a single Playlists link that opens the playlists page", async ({
  page,
}) => {
  await signIn(page);
  await page.route(HISTORY, (route) =>
    route.fulfill({ json: { videos: [], limit: 12, offset: 0 } }),
  );
  await page.route(PLAYLISTS, (route) => route.fulfill({ json: { playlists: [] } }));
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  // Empty hubs still surface the entry points.
  await expect(page.getByText("No playlists yet. Create one to organise videos.")).toBeVisible();
  await expect(page.getByText("Your library is empty")).toBeVisible();

  // Exactly one link is named "Playlists" (strict-mode click proves uniqueness).
  const playlists = page.getByRole("main").getByRole("link", { name: "Playlists" });
  await playlists.click();
  await expect(page).toHaveURL(/\/playlists$/);
});
