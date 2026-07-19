import { expect, test, type Page } from "@playwright/test";

// Mocked creator-stats coverage (a real backend is not running in `npm run ci`).
// Both stats endpoints are read-only, so mocked coverage is the full story here.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_STATS = /\/api\/v1\/channels\/ada_makes\/stats$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const VIDEO_STATS = /\/api\/v1\/videos\/v1\/stats$/;

// A dense 30-day series, oldest first, matching the contract's shape.
function dailyViews(totalOnLastDay: number) {
  const series: Array<{ day: string; views: number }> = [];
  const start = new Date("2026-06-01T00:00:00Z");
  for (let i = 0; i < 30; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    series.push({ day: d.toISOString().slice(0, 10), views: i === 29 ? totalOnLastDay : 0 });
  }
  return series;
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
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function channel() {
  return {
    id: "c1",
    owner_id: "u1",
    handle: "ada_makes",
    display_name: "Ada Makes",
    description: "",
    follower_count: 3,
    created_at: new Date().toISOString(),
  };
}

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

// Creator stats now live in the Studio Analytics tab. Reaching it is a two-step
// client nav (preserving the in-memory session): sidebar "Studio" → dashboard,
// then the StudioNav tab strip → Analytics.
async function gotoAnalytics(page: Page) {
  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
}

test("the old /studio/stats link redirects into the Analytics tab", async ({ page }) => {
  await page.goto("/studio/stats");
  await expect(page).toHaveURL(/\/studio\/analytics$/);
  // Anonymous: the shared studio shell gates the whole surface.
  await expect(page.getByText("Sign in to use the studio")).toBeVisible();
});

test("a creator sees channel totals, the 30-day chart, and drills into a video", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_STATS, (route) =>
    route.fulfill({
      json: {
        views: 1234,
        likes: 56,
        dislikes: 7,
        comments: 89,
        followers: 3,
        videos: 4,
        daily_views: dailyViews(41),
      },
    }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: {
        videos: [
          {
            id: "v1",
            channel_id: "c1",
            title: "My clip",
            description: "",
            privacy: "public",
            state: "published",
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(VIDEO_STATS, (route) =>
    route.fulfill({
      json: { views: 41, likes: 2, dislikes: 0, comments: 5, daily_views: dailyViews(41) },
    }),
  );

  await gotoAnalytics(page);

  // The scope switcher + the current channel's totals + the accessible SVG chart.
  await expect(page.getByRole("group", { name: "Analytics scope" })).toBeVisible();
  const channelSection = page.getByRole("region", { name: "Stats for @ada_makes" });
  await expect(channelSection.getByText("1.2K")).toBeVisible(); // views total, compact
  await expect(channelSection.getByText("Followers")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Daily views for @ada_makes: 41 views over the last 30 days" }),
  ).toBeVisible();

  // Drill into the only video.
  await page.getByLabel("Stats video").selectOption("v1");
  await expect(
    page.getByRole("img", { name: "Daily views for this video: 41 views over the last 30 days" }),
  ).toBeVisible();
  // The per-video totals grid shows its comment count.
  await expect(page.getByText("Comments")).toHaveCount(2); // channel + video grids
});

test("a creator with no channels sees the analytics onboarding", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [] } }));

  await gotoAnalytics(page);

  await expect(page.getByText("No channels yet")).toBeVisible();
});

test("a failed channel-stats load shows an error with retry", async ({ page }) => {
  await signIn(page);
  await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [channel()] } }));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  // Flag-based (not call-count based): the dashboard's quick-stats strip also
  // calls getChannelStats on the way through, so a "fail the Nth call" mock would
  // be racy. All calls fail while `failing` is set (dashboard + the analytics
  // ChannelScope's initial load → the error state); the test flips it off before
  // the retry.
  let failing = true;
  await page.route(CHANNEL_STATS, (route) => {
    if (failing) {
      return route.fulfill({
        status: 500,
        json: { error: { code: "internal", message: "boom" } },
      });
    }
    return route.fulfill({
      json: {
        views: 9,
        likes: 0,
        dislikes: 0,
        comments: 0,
        followers: 3,
        videos: 0,
        daily_views: dailyViews(9),
      },
    });
  });

  await gotoAnalytics(page);

  await expect(page.getByText("Could not load this channel's stats.")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("img", { name: "Daily views for @ada_makes: 9 views over the last 30 days" }),
  ).toBeVisible();
});
