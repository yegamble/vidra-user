import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated axe-core accessibility checks over the key surfaces (P12). The gate
// is serious/critical violations only — minor/moderate findings are reported in
// the failure message when a severe one trips, but do not fail the build on
// their own (kept actionable, not noisy). Pages are route-mocked like every
// other spec in this suite; a real backend is not running in `npm run ci`.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;

type Role = "user" | "admin";

function session(role: Role) {
  return {
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
  };
}

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

// Run axe and fail on serious/critical violations, with a readable dump.
async function expectNoSevereViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const dump = severe.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.html),
  }));
  expect(dump, "axe found serious/critical accessibility violations").toEqual([]);
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 3 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("home passes axe (feed cards rendered)", async ({ page }) => {
  await page.route(FEED, (route) =>
    route.fulfill({
      json: {
        videos: [video("v1", "First Test Video", 1500), video("v2", "Second Test Video", 0)],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "First Test Video" })).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the watch page passes axe (player, metadata, comments)", async ({ page }) => {
  await page.route(/\/api\/v1\/videos\/v1$/, (route) =>
    route.fulfill({
      json: { ...video("v1", "Watch Me", 4200), description: "A nice clip.", width: 1280, height: 720 },
    }),
  );
  // The <video> preload would hit the original stream — abort it (hermetic).
  await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({
      json: {
        comments: [
          {
            id: "cm1",
            video_id: "v1",
            author_id: "u2",
            author_username: "ada",
            body: "Great video!",
            created_at: new Date().toISOString(),
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 2, dislike_count: 0, my_rating: null } }),
  );
  // A caption track so the player carries captions (axe video-caption rule).
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({
      json: {
        captions: [{ language: "en", label: "English", created_at: new Date().toISOString() }],
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions\/en$/, (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n",
    }),
  );
  await page.route(/\/api\/v1\/users\/u2\/avatar/, (route) => route.abort());

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await expect(page.getByText("Great video!")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the watch page passes axe in theater mode (reflowed layout)", async ({ page }) => {
  await page.route(/\/api\/v1\/videos\/v1$/, (route) =>
    route.fulfill({ json: { ...video("v1", "Watch Me", 4200), width: 1280, height: 720 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  // The related rail so the reflowed-below grid is exercised by axe.
  await page.route(/\/api\/v1\/channels\/ada\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [video("v2", "Follow-up", 12), video("v3", "Encore", 8)] } }),
  );
  await page.route(/\/avatar/, (route) => route.abort());

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await page.getByRole("button", { name: "Theater mode" }).click();
  await expect(page.locator("[data-theater='on']")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the watch page passes axe with the autoplay end card shown (PLAY-08)", async ({ page }) => {
  await page.route(/\/api\/v1\/videos\/v1$/, (route) =>
    route.fulfill({ json: { ...video("v1", "Watch Me", 4200), width: 1280, height: 720 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  // A related entry so the end card renders its "next" branch (thumbnail + title
  // + Play now + the Autoplay switch), the richest a11y surface of the card.
  await page.route(/\/api\/v1\/channels\/ada\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [video("v2", "Follow-up", 12)] } }),
  );
  await page.route(/\/avatar/, (route) => route.abort());

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Related videos" }).getByRole("heading", {
      name: "Follow-up",
    }),
  ).toBeVisible();
  await page
    .locator("video")
    .first()
    .evaluate((el: HTMLVideoElement) => el.dispatchEvent(new Event("ended")));
  await expect(page.getByTestId("player-end-card")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the login page passes axe", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the settings page passes axe (signed in)", async ({ page }) => {
  await signIn(page, "user");
  await page.getByRole("link", { name: "boss" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the playback settings page passes axe (grouped toggles + selects)", async ({ page }) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/player-settings$/, (route) =>
    route.fulfill({
      json: {
        autoplay_next: true,
        default_speed: 1.5,
        default_quality: "1080p",
        captions_default: false,
        theater_default: true,
      },
    }),
  );
  // Client-side nav (avatar → settings → Playback) keeps the in-memory session.
  await page.getByRole("link", { name: "boss" }).click();
  await page.getByRole("link", { name: "Manage playback settings" }).click();
  await expect(page.getByRole("switch", { name: "Autoplay next" })).toBeVisible();
  await expect(page.getByLabel("Default speed")).toHaveValue("1.5");
  await expectNoSevereViolations(page);
});

test("the studio page passes axe (signed in, channels + create form)", async ({ page }) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/channels$/, (route) =>
    route.fulfill({ json: { channels: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/config$/, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your channels" })).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the channel page passes axe (visitor cluster + tabs)", async ({ page }) => {
  // A fresh page load re-boots the auth store, so land authed via
  // /auth/refresh → /auth/me (design-shots technique) instead of the login UI.
  // The signed-in "u1" is NOT the owner ("u9"), so the full visitor action
  // cluster (Follow / Support / Message) and the underline tabs all render.
  const me = session("user").user;
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: session("user") }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: me }));
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
    route.fulfill({ json: { channels: [], limit: 15, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/channels\/ada$/, (route) =>
    route.fulfill({
      json: {
        id: "c1",
        owner_id: "u9",
        handle: "ada",
        display_name: "Ada Makes",
        description: "Making things, on camera.",
        follower_count: 1500,
        created_at: "2024-03-10T00:00:00Z",
        has_avatar: false,
        has_banner: false,
      },
    }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [video("v1", "Building a Desk", 10), video("v2", "Encore", 8)] } }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/donation-addresses/, (route) =>
    route.fulfill({
      json: {
        addresses: [
          {
            id: "da1",
            owner_id: "u9",
            network: "bitcoin",
            address: "bc1qexampleaddress",
            label: "",
            verified: false,
            created_at: new Date().toISOString(),
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(/\/api\/v1\/users\/u9\/donation-addresses/, (route) =>
    route.fulfill({ json: { addresses: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/avatar/, (route) => route.abort());

  await page.goto("/channels/ada");
  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Support" })).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the messages page passes axe (signed in, inbox rendered)", async ({ page }) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/conversations(\?|$)/, (route) =>
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
  await page.getByRole("link", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
  await expect(page.getByText("Bob Builder")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the messages thread passes axe (grouped runs, separators, seen)", async ({ page }) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/conversations(\?|$)/, (route) =>
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
  await page.route(/\/api\/v1\/conversations\/c1\/messages(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      json: {
        messages: [
          {
            id: "m2",
            conversation_id: "c1",
            sender_id: "u1",
            sender_username: "boss",
            sender_display_name: "Boss",
            body: "sounds good",
            created_at: new Date().toISOString(),
          },
          {
            id: "m1",
            conversation_id: "c1",
            sender_id: "u2",
            sender_username: "bob",
            sender_display_name: "Bob Builder",
            body: "see you then",
            created_at: new Date().toISOString(),
          },
        ],
        peer_last_read_message_id: "m2",
        limit: 100,
        offset: 0,
      },
    });
  });
  await page.route(/\/api\/v1\/conversations\/c1\/read$/, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route(/\/api\/v1\/users\/[^/]+\/avatar$/, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );

  await page.getByRole("link", { name: "Messages" }).click();
  await page.getByText("Bob Builder").click();
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toBeVisible();
  await expect(page.getByText("sounds good")).toBeVisible();
  await expect(page.getByText("Seen")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the admin users page passes axe (admin, list rendered)", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: {
        users: [
          {
            id: "u1",
            username: "boss",
            email: "boss@example.test",
            role: "admin",
            is_active: true,
            email_verified: true,
            display_name: "Boss",
            created_at: new Date().toISOString(),
          },
          {
            id: "u2",
            username: "alice",
            email: "alice@example.test",
            role: "user",
            is_active: false,
            email_verified: false,
            display_name: "Alice",
            created_at: new Date().toISOString(),
          },
        ],
        limit: 100,
        offset: 0,
      },
    }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  // The email renders in both the desktop table and the (display:none) mobile
  // card, so scope to the visible desktop console surface (DR12).
  await expect(
    page.getByTestId("admin-users-desktop").getByText("alice@example.test"),
  ).toBeVisible();
  await expectNoSevereViolations(page);
});
