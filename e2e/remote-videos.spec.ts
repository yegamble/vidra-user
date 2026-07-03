import { expect, test, type Page } from "@playwright/test";

// Mocked federated remote-video coverage: remote cards (origin badge, remote
// watch link) in the subscriptions feed and the scope=all home feed, the
// Local/All scope toggle (URL-reflected), the /remote/[id] watch surface
// (origin playback + watch-on-origin link + honest no-interactions copy), and
// the Mute-instance control. Persistence of the instance mute is proven in
// e2e-backed/instance-mutes.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const SUBS = /\/api\/v1\/me\/subscriptions\/videos(\?|$)/;
const REMOTE_FOLLOWS = /\/api\/v1\/me\/remote-follows(\?|$)/;
const REMOTE_DETAIL = /\/api\/v1\/remote-videos\/rv1$/;
const INSTANCE_MUTE = /\/api\/v1\/me\/mutes\/instances\/[^/]+$/;

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
    display_name: "",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function localVideo(id: string, title: string) {
  return {
    id,
    channel_id: "ch1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    has_thumbnail: false,
  };
}

// A remote card as the feeds serve it: remote:true, no channel_id/privacy/
// state, origin domain + watch/stream URLs, name@domain channel identity.
function remoteCard(id: string, title: string) {
  return {
    id,
    remote: true,
    title,
    description: "",
    created_at: new Date().toISOString(),
    domain: "videos.example",
    watch_url: `https://videos.example/w/${id}`,
    stream_url: `https://videos.example/static/${id}.mp4`,
    channel_handle: "films@videos.example",
    channel_display_name: "Films",
    duration_seconds: 62,
    has_thumbnail: false,
  };
}

function remoteDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "rv1",
    remote: true,
    domain: "videos.example",
    title: "Remote Documentary",
    description: "A film from another instance.",
    object_url: "https://videos.example/videos/rv1",
    watch_url: "https://videos.example/w/rv1",
    stream_url: "https://videos.example/static/rv1.mp4",
    duration_seconds: 62,
    published_at: new Date().toISOString(),
    has_thumbnail: false,
    ...overrides,
  };
}

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("the subscriptions feed renders remote cards with an origin badge linking to /remote/[id]", async ({
  page,
}) => {
  await signIn(page);
  await page.route(REMOTE_FOLLOWS, (route) =>
    route.fulfill({ json: { follows: [], limit: 100, offset: 0 } }),
  );
  await page.route(SUBS, (route) =>
    route.fulfill({
      json: {
        videos: [remoteCard("rv1", "Remote Documentary"), localVideo("v1", "Local Video")],
        sort: "recent",
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.getByRole("link", { name: "Subscriptions" }).click();
  const remoteItem = page.locator("li", { hasText: "Remote Documentary" });
  await expect(remoteItem.getByText("videos.example")).toBeVisible();
  await expect(remoteItem.getByText("Films")).toBeVisible();
  // Remote cards carry the shared ActivityPub protocol label (fix_plan P11).
  await expect(remoteItem.getByText("ActivityPub")).toBeVisible();
  await expect(
    remoteItem.getByRole("link", { name: /Remote Documentary/ }),
  ).toHaveAttribute("href", "/remote/rv1");
  // The local card keeps its local watch link and shows no origin/protocol badge.
  const localItem = page.locator("li", { hasText: "Local Video" });
  await expect(localItem.getByRole("link", { name: /Local Video/ })).toHaveAttribute(
    "href",
    "/videos/v1",
  );
  await expect(localItem.getByText("videos.example")).toHaveCount(0);
  await expect(localItem.getByText("ActivityPub")).toHaveCount(0);
});

test("search results render remote cards with the origin badge and remote watch link", async ({
  page,
}) => {
  await page.route(/\/api\/v1\/videos\/search(\?|$)/, (route) =>
    route.fulfill({
      json: {
        query: "documentary",
        videos: [remoteCard("rv1", "Remote Documentary"), localVideo("v1", "Local Documentary")],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.goto("/search?q=documentary");
  const remoteItem = page.locator("li", { hasText: "Remote Documentary" });
  await expect(remoteItem.getByText("videos.example")).toBeVisible();
  await expect(remoteItem.getByRole("link", { name: /Remote Documentary/ })).toHaveAttribute(
    "href",
    "/remote/rv1",
  );
  await expect(
    page.locator("li", { hasText: "Local Documentary" }).getByRole("link", { name: /Local Documentary/ }),
  ).toHaveAttribute("href", "/videos/v1");
});

test("the home feed scope toggle is URL-reflected and requests scope=all", async ({ page }) => {
  const feedRequests: string[] = [];
  await page.route(FEED, (route) => {
    const url = new URL(route.request().url());
    feedRequests.push(url.search);
    const all = url.searchParams.get("scope") === "all";
    return route.fulfill({
      json: {
        videos: all
          ? [localVideo("v1", "Local Video"), remoteCard("rv1", "Remote Documentary")]
          : [localVideo("v1", "Local Video")],
        sort: "recent",
        scope: all ? "all" : "local",
        limit: 20,
        offset: 0,
      },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Local Video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remote Documentary" })).toHaveCount(0);

  const scopeToggle = page.getByRole("group", { name: "Feed scope" });
  await expect(scopeToggle.getByRole("button", { name: "Local" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await scopeToggle.getByRole("button", { name: "All" }).click();
  await expect(page).toHaveURL(/\?scope=all$/);
  await expect(page.getByRole("heading", { name: "Remote Documentary" })).toBeVisible();
  await expect(scopeToggle.getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The default local fetch carried no scope param; the All fetch did.
  expect(feedRequests.some((q) => !q.includes("scope="))).toBe(true);
  expect(feedRequests.some((q) => q.includes("scope=all"))).toBe(true);

  // Back to Local: the scope leaves the URL.
  await scopeToggle.getByRole("button", { name: "Local" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Remote Documentary" })).toHaveCount(0);
});

test("the remote watch page plays the origin stream and always links the origin watch page", async ({
  page,
}) => {
  await page.route(REMOTE_DETAIL, (route) => route.fulfill({ json: remoteDetail() }));

  await page.goto("/remote/rv1");
  await expect(page.getByRole("heading", { level: 1, name: "Remote Documentary" })).toBeVisible();
  await expect(page.getByText("videos.example").first()).toBeVisible();
  // The shared ActivityPub protocol label sits next to the origin chip.
  await expect(page.getByText("ActivityPub")).toBeVisible();

  // Direct-file playback from the origin.
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://videos.example/static/rv1.mp4",
  );

  // The origin link is always present, opens a new tab, and is rel-guarded.
  const originLink = page.getByRole("link", { name: /Watch on videos\.example/ });
  await expect(originLink).toHaveAttribute("href", "https://videos.example/w/rv1");
  await expect(originLink).toHaveAttribute("target", "_blank");
  await expect(originLink).toHaveAttribute("rel", "noopener noreferrer");

  // Honest copy: interactions live at the origin — no local comment/rating/save UI.
  await expect(
    page.getByText(
      "This is a federated video from videos.example. Comments, ratings, and saving live on the origin instance.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Like" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(page.getByLabel(/comment/i)).toHaveCount(0);
});

test("a remote video without a stream shows the honest no-playback panel", async ({ page }) => {
  await page.route(REMOTE_DETAIL, (route) =>
    route.fulfill({ json: remoteDetail({ stream_url: undefined }) }),
  );

  await page.goto("/remote/rv1");
  await expect(page.getByText("This video can’t be played here.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Watch on videos\.example/ })).toBeVisible();
});

test("an unknown or origin-blocked remote video is a not-found state", async ({ page }) => {
  await page.route(REMOTE_DETAIL, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no" } } }),
  );

  await page.goto("/remote/rv1");
  await expect(page.getByText("Video not found")).toBeVisible();
});

test("a signed-in viewer can mute (and undo-unmute) the origin instance from the watch page", async ({
  page,
}) => {
  await signIn(page);
  await page.route(REMOTE_DETAIL, (route) => route.fulfill({ json: remoteDetail() }));
  await page.route(REMOTE_FOLLOWS, (route) =>
    route.fulfill({ json: { follows: [], limit: 100, offset: 0 } }),
  );
  await page.route(SUBS, (route) =>
    route.fulfill({
      json: { videos: [remoteCard("rv1", "Remote Documentary")], sort: "recent", limit: 20, offset: 0 },
    }),
  );

  const muteCalls: Array<{ method: string; url: string }> = [];
  await page.route(INSTANCE_MUTE, (route) => {
    muteCalls.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({ status: 204, body: "" });
  });

  // Reach the remote watch page via a subscriptions card (client-side nav
  // keeps the in-memory session).
  await page.getByRole("link", { name: "Subscriptions" }).click();
  await page.getByRole("heading", { name: "Remote Documentary" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Remote Documentary" })).toBeVisible();

  const muted = page.waitForResponse(
    (r) => INSTANCE_MUTE.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Mute instance videos.example" }).click();
  await muted;

  await expect(
    page.getByText("Muted videos.example. Its videos and comments no longer appear for you."),
  ).toBeVisible();

  // The control flips to Unmute (the management list lives under settings).
  const unmuted = page.waitForResponse(
    (r) => INSTANCE_MUTE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unmute instance videos.example" }).click();
  await unmuted;

  expect(muteCalls[0].method).toBe("POST");
  expect(muteCalls[0].url).toContain("/api/v1/me/mutes/instances/videos.example");
  expect(muteCalls[1].method).toBe("DELETE");
});

test("anonymous viewers get no mute-instance control on the remote watch page", async ({
  page,
}) => {
  await page.route(REMOTE_DETAIL, (route) => route.fulfill({ json: remoteDetail() }));
  await page.goto("/remote/rv1");
  await expect(page.getByRole("heading", { level: 1, name: "Remote Documentary" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mute instance/ })).toHaveCount(0);
  // Reporting requires an account too: the control degrades to a sign-in link.
  await expect(page.getByRole("link", { name: "Sign in to report" })).toBeVisible();
});

test("a signed-in viewer can report a remote video to the local moderators", async ({ page }) => {
  await signIn(page);
  await page.route(REMOTE_DETAIL, (route) => route.fulfill({ json: remoteDetail() }));
  await page.route(REMOTE_FOLLOWS, (route) =>
    route.fulfill({ json: { follows: [], limit: 100, offset: 0 } }),
  );
  await page.route(SUBS, (route) =>
    route.fulfill({
      json: { videos: [remoteCard("rv1", "Remote Documentary")], sort: "recent", limit: 20, offset: 0 },
    }),
  );
  const reportCalls: Array<{ url: string; body: unknown }> = [];
  await page.route(/\/api\/v1\/remote-videos\/rv1\/report$/, (route) => {
    reportCalls.push({ url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({ status: 204, body: "" });
  });

  // Reach the remote watch page via a subscriptions card (client-side nav
  // keeps the in-memory session).
  await page.getByRole("link", { name: "Subscriptions" }).click();
  await page.getByRole("heading", { name: "Remote Documentary" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Remote Documentary" })).toBeVisible();

  await page.getByRole("button", { name: "Report this video" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this video" });
  await dialog.getByLabel("Reason for report").fill("stolen content");

  const reported = page.waitForResponse(
    (r) =>
      /\/api\/v1\/remote-videos\/rv1\/report$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await reported;

  await expect(
    dialog.getByText("Thanks — your report has been sent to the moderators."),
  ).toBeVisible();
  expect(reportCalls[0].url).toContain("/api/v1/remote-videos/rv1/report");
  expect(reportCalls[0].body).toEqual({ reason: "stolen content" });
});
