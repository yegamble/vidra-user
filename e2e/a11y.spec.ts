import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated axe-core accessibility checks over the key surfaces (P12). The gate
// is serious/critical violations only — minor/moderate findings are reported in
// the failure message when a severe one trips, but do not fail the build on
// their own (kept actionable, not noisy). Pages are route-mocked like every
// other spec in this suite; a real backend is not running in `npm run ci`.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const SEARCH = /\/api\/v1\/videos\/search/;
const SUGGEST = /\/api\/v1\/search\/suggestions/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;

// A mixed suggestion set (queries + history + video/channel/tag groups) so axe
// exercises the full grouped panel: headers, per-row type labels, and the
// history remove ×.
function suggestionPanel(q: string) {
  return {
    query: q,
    suggestions: [
      { text: "golang tutorials", type: "query", is_personal: false },
      { text: "go basics", type: "history", is_personal: true },
      { text: "Go Deep Dive", type: "video", is_personal: false, video_id: "v1" },
      { text: "Go Channel", type: "channel", is_personal: false, channel_handle: "go" },
      { text: "golang", type: "tag", is_personal: false },
    ],
  };
}

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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
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

// The redesigned suggestion panel must pass axe wherever the header box renders.
async function openHeaderPanel(page: Page) {
  await page.route(SUGGEST, (route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    route.fulfill({ json: suggestionPanel(q) });
  });
  // Type a value distinct from any reflected /search query so the draft actually
  // changes (and the panel opens) even when the box already mirrors `q`.
  const box = page.getByLabel("Search videos");
  await box.fill("golang");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible();
}

test("home passes axe with the search suggestions panel open", async ({ page }) => {
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");
  await openHeaderPanel(page);
  await expectNoSevereViolations(page);
});

test("the search page passes axe with the suggestions panel open", async ({ page }) => {
  await page.route(SEARCH, (route) =>
    route.fulfill({ json: { query: "go", videos: [video("v1", "Go Basics", 3)], limit: 20, offset: 0 } }),
  );
  await page.goto("/search?q=go");
  await expect(page.getByRole("heading", { name: "Go Basics" })).toBeVisible();
  // Re-focus the header box and type to reopen the grouped panel over the results.
  await openHeaderPanel(page);
  await expectNoSevereViolations(page);
});

test("the watch page passes axe with the search suggestions panel open", async ({ page }) => {
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
  await page.route(/\/api\/v1\/channels\/ada\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [] } }),
  );
  await page.route(/\/avatar/, (route) => route.abort());

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await openHeaderPanel(page);
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
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
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
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage playback settings" }).click();
  await expect(page.getByRole("switch", { name: "Autoplay next" })).toBeVisible();
  await expect(page.getByLabel("Default speed")).toHaveValue("1.5");
  await expectNoSevereViolations(page);
});

test("the studio dashboard and channel create form pass axe (signed in)", async ({ page }) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/channels$/, (route) =>
    route.fulfill({ json: { channels: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/config$/, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  // The dashboard (zero channels → onboarding).
  await page.getByRole("link", { name: "Studio" }).click();
  await expect(page.getByRole("heading", { name: "Studio", level: 1 })).toBeVisible();
  await expect(page.getByText("Welcome to your studio")).toBeVisible();
  await expectNoSevereViolations(page);
  // The Channel tab's onboarding create form.
  await page.getByRole("link", { name: "Channel", exact: true }).click();
  await expect(page.getByText("Create your first channel")).toBeVisible();
  await expectNoSevereViolations(page);
});

test("the studio channel auto-sync section passes axe (list + state pills + connect form)", async ({
  page,
}) => {
  await signIn(page, "user");
  await page.route(/\/api\/v1\/me\/channels$/, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "c1",
            owner_id: "u1",
            handle: "ada",
            display_name: "Ada Makes",
            description: "",
            follower_count: 0,
            created_at: new Date().toISOString(),
            // Required on the Channel contract; the Channel tab's distribution
            // toggles read them (an absent flag would drop aria-checked).
            activitypub_enabled: true,
            atproto_enabled: true,
            role: "owner",
          },
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/config$/, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );
  await page.route(/\/api\/v1\/instance$/, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        description: "",
        software: { name: "vidra", version: "0.1.0" },
        registration_enabled: true,
        registration_requires_approval: false,
        oauth_providers: [],
        federation_enabled: false,
        terms_url: "",
        privacy_url: "",
        contact_email: "",
        features: { uploads: true, imports: true, live: true, comments: true },
      },
    }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [] } }),
  );
  await page.route(/\/api\/v1\/channels\/ada\/live$/, (route) =>
    route.fulfill({ json: { live_streams: [] } }),
  );
  // The Channel tab also mounts the collaborators + distribution cards.
  await page.route(/\/api\/v1\/channels\/ada\/members$/, (route) =>
    route.fulfill({ json: { members: [] } }),
  );
  await page.route(/\/api\/v1\/me\/atproto$/, (route) =>
    route.fulfill({ status: 503, json: { error: { code: "disabled", message: "off" } } }),
  );
  await page.route(/\/api\/v1\/channel-syncs$/, (route) =>
    route.fulfill({
      json: {
        channel_syncs: [
          {
            id: "cs1",
            channel_id: "c1",
            external_channel_url: "https://www.youtube.com/@example",
            state: "idle",
            last_sync_at: new Date(Date.now() - 3_600_000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "cs2",
            channel_id: "c1",
            external_channel_url: "https://vids.example/c/craft",
            state: "failed",
            last_error: "the external channel could not be resolved",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "cs3",
            channel_id: "c1",
            external_channel_url: "https://vids.example/c/live-run",
            state: "syncing",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "cs4",
            channel_id: "c1",
            external_channel_url: "https://vids.example/c/queued",
            state: "waiting_first_run",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  // The channel auto-sync section now lives on the Studio Channel tab.
  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByRole("link", { name: "Channel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Auto-import from another platform" }),
  ).toBeVisible();
  await expect(page.getByText("the external channel could not be resolved")).toBeVisible();
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
