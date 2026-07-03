import { expect, test, type Page } from "@playwright/test";

// Mocked quarantine coverage (a real backend is not running in `npm run ci`;
// the approve persistence round-trip is proven in e2e-backed/quarantine.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;
const QUEUE = /\/api\/v1\/admin\/videos\/quarantined(\?|$)/;
const APPROVE = /\/api\/v1\/admin\/videos\/[^/]+\/approve$/;
const REJECT = /\/api\/v1\/admin\/videos\/[^/]+\/reject$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada_makes\/videos$/;
const UPLOAD = /\/api\/v1\/videos\/v1\/file$/;
const VIDEO_CONFIG = /\/api\/v1\/videos\/config$/;
const NOTIFICATIONS = /\/api\/v1\/me\/notifications(\?|$)/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "ada",
      email: "ada@example.test",
      role,
      email_verified: false,
      display_name: "Ada",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

function held(id: string, title: string) {
  return {
    id,
    title,
    privacy: "public",
    state: "quarantined",
    channel_handle: "bobs_channel",
    channel_display_name: "Bobs Channel",
    owner_username: "bob",
    created_at: new Date().toISOString(),
  };
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    channel_id: "c1",
    title: "My clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(REPORTS, (route) => route.fulfill({ json: { reports: [], limit: 20, offset: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("anonymous viewers are gated out of the quarantine queue", async ({ page }) => {
  let fetched = false;
  await page.route(QUEUE, (route) => {
    fetched = true;
    return route.fulfill({ json: { videos: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation/quarantine");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a moderator approves a held upload and it leaves the queue", async ({ page }) => {
  await signIn(page, "moderator");
  await page.route(QUEUE, (route) =>
    route.fulfill({
      json: { videos: [held("q1", "Held clip"), held("q2", "Other clip")], limit: 100, offset: 0 },
    }),
  );
  let approvedId: string | null = null;
  await page.route(APPROVE, (route) => {
    approvedId = route.request().url().match(/\/videos\/([^/]+)\/approve$/)?.[1] ?? null;
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Quarantine" }).click();
  await expect(page.getByText("Held clip")).toBeVisible();
  await expect(page.getByText("by bob", { exact: false }).first()).toBeVisible();

  const approved = page.waitForResponse(
    (r) => APPROVE.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  const row = page.locator("article").filter({ hasText: "Held clip" });
  await row.getByRole("button", { name: "Approve" }).click();
  await approved;

  await expect(page.getByText("Held clip")).toHaveCount(0);
  await expect(page.getByText("Other clip")).toBeVisible();
  expect(approvedId).toBe("q1");
});

test("a moderator rejects a held upload with a reason", async ({ page }) => {
  await signIn(page, "moderator");
  await page.route(QUEUE, (route) =>
    route.fulfill({ json: { videos: [held("q1", "Held clip")], limit: 100, offset: 0 } }),
  );
  let rejectBody: unknown;
  await page.route(REJECT, (route) => {
    rejectBody = route.request().postDataJSON();
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Quarantine" }).click();
  await page.getByLabel("Rejection reason for Held clip").fill("not allowed on this instance");

  const rejected = page.waitForResponse(
    (r) => REJECT.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Reject" }).click();
  await rejected;

  await expect(page.getByText("Held clip")).toHaveCount(0);
  await expect(page.getByText("No uploads waiting for review")).toBeVisible();
  expect(rejectBody).toEqual({ reason: "not allowed on this instance" });
});

test("the studio row badges a quarantined upload with explanatory copy", async ({ page }) => {
  await signIn(page, "user");
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "c1",
            owner_id: "u1",
            handle: "ada_makes",
            display_name: "Ada Makes",
            description: "",
            follower_count: 0,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video({ state: "quarantined" })] } }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "My clip" });
  await expect(row.getByText("quarantined", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Held for review — this instance reviews new uploads", { exact: false }),
  ).toBeVisible();
});

test("a quarantined publish outcome is reported as held for review, not failed or published", async ({
  page,
}) => {
  await signIn(page, "user");
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "c1",
            owner_id: "u1",
            handle: "ada_makes",
            display_name: "Ada Makes",
            description: "",
            follower_count: 0,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: video({ state: "draft" }) });
    }
    return route.fulfill({ json: { videos: [] } });
  });
  await page.route(UPLOAD, (route) =>
    route.fulfill({ json: { video: video({ state: "quarantined" }) } }),
  );
  await page.route(VIDEO_CONFIG, (route) =>
    route.fulfill({ json: { categories: [], licenses: [], languages: [], privacies: [] } }),
  );

  await page.getByRole("link", { name: "Studio" }).click();
  await page.getByLabel("Video title").fill("My clip");
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("test"),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page.getByText("held for review", { exact: false })).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);
  await expect(page.getByText("Processing failed", { exact: false })).toHaveCount(0);
});

test("a video_rejected notification tells the owner and links to the studio", async ({ page }) => {
  await signIn(page, "user");
  await page.route(NOTIFICATIONS, (route) =>
    route.fulfill({
      json: {
        notifications: [
          {
            id: "n1",
            type: "video_rejected",
            read: false,
            created_at: new Date().toISOString(),
            video_id: "v1",
            video_title: "My clip",
          },
        ],
        unread_count: 1,
        limit: 20,
        offset: 0,
      },
    }),
  );

  // Client-side nav via the header bell keeps the in-memory session alive.
  await page.getByRole("link", { name: /Notifications/ }).click();
  const link = page.getByRole("link", {
    name: "A moderator rejected your upload “My clip” — it was not published",
  });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/studio");
});
