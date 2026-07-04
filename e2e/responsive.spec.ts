import { expect, test, type Page } from "@playwright/test";

// Responsive coverage for the key surfaces at phone + tablet widths (P12).
// Everything is route-mocked (no backend in `npm run ci`). The core assertion
// is that no surface forces horizontal scrolling and its primary heading is
// reachable at the narrow viewport. Signed-in surfaces (studio, messages) are
// seeded through the cookie-mode boot refresh so a direct navigation lands
// authenticated at any viewport (the sidebar/account menu collapse on phones).
const FEED = /\/api\/v1\/videos(\?|$)/;
const DETAIL = /\/api\/v1\/videos\/v1$/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const CONVERSATIONS = /\/api\/v1\/me\/conversations(\?|$)/;

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: true,
  display_name: "Ada",
  bio: "",
  created_at: new Date().toISOString(),
};

function video(id: string, title: string, views: number) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views,
    has_thumbnail: false,
    duration_seconds: 83,
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
  };
}

// Seed a live session on a fresh (hard) navigation via the boot refresh.
async function seedSignedIn(page: Page) {
  await page.route(REFRESH, (route) =>
    route.fulfill({ json: { token: "acc", token_type: "Bearer", expires_in: 900, user } }),
  );
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
}

// The page must not scroll horizontally (a 1px rounding tolerance).
async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(1);
}

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} viewport (${vp.width}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("home fits without horizontal scroll", async ({ page }) => {
      await page.route(/\/avatar/, (route) => route.abort());
      await page.route(FEED, (route) =>
        route.fulfill({
          json: {
            videos: [video("v1", "First clip", 12), video("v2", "Second clip", 0)],
            sort: "recent",
            limit: 20,
            offset: 0,
          },
        }),
      );
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Recent videos" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "First clip" })).toBeVisible();
      await assertNoHorizontalScroll(page);
    });

    test("watch fits without horizontal scroll", async ({ page }) => {
      await page.route(DETAIL, (route) =>
        route.fulfill({
          json: { ...video("v1", "Watch Me", 4200), description: "A clip.", width: 1280, height: 720 },
        }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
      await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
        route.fulfill({ json: { captions: [] } }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
        route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
        route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
      );
      await page.route(/\/avatar/, (route) => route.abort());
      await page.goto("/videos/v1");
      await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
      await assertNoHorizontalScroll(page);
    });

    test("studio fits without horizontal scroll", async ({ page }) => {
      await seedSignedIn(page);
      await page.route(MY_CHANNELS, (route) => route.fulfill({ json: { channels: [] } }));
      await page.route(VIDEO_CONFIG, (route) =>
        route.fulfill({
          json: { categories: [], licenses: [], languages: [], privacies: [] },
        }),
      );
      await page.goto("/studio");
      await expect(page.getByRole("heading", { name: "Studio", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Your channels" })).toBeVisible();
      await assertNoHorizontalScroll(page);
    });

    test("messages fits without horizontal scroll", async ({ page }) => {
      await seedSignedIn(page);
      await page.route(CONVERSATIONS, (route) =>
        route.fulfill({
          json: {
            conversations: [
              {
                id: "c1",
                updated_at: new Date().toISOString(),
                other_user_id: "u2",
                other_username: "bob",
                other_display_name: "Bob Builder",
                last_message_body: "see you then",
                last_message_at: new Date().toISOString(),
              },
            ],
            limit: 20,
            offset: 0,
          },
        }),
      );
      await page.goto("/messages");
      await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
      await expect(page.getByText("Bob Builder")).toBeVisible();
      await assertNoHorizontalScroll(page);
    });
  });
}
