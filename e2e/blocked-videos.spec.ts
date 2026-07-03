import { expect, test, type Page } from "@playwright/test";

// Mocked block-list coverage (a real backend is not running in `npm run ci`; the
// persistence round-trip is proven in e2e-backed/blocked-videos.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const BLOCKED = /\/api\/v1\/admin\/videos\/blocked(\?|$)/;
const UNBLOCK = /\/api\/v1\/admin\/videos\/[^/]+\/block$/;
const REMOTE_BLOCKED = /\/api\/v1\/admin\/remote-videos\/blocked(\?|$)/;
const REMOTE_UNBLOCK = /\/api\/v1\/admin\/remote-videos\/[^/]+\/block$/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "mod",
      email: "mod@example.test",
      role,
      email_verified: false,
      display_name: "Mod",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

function blocked(id: string, title: string) {
  return {
    video_id: id,
    title,
    privacy: "public",
    state: "published",
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
    reason: `reason-${id}`,
    blocked_by: "e2eadmin",
    blocked_at: new Date().toISOString(),
  };
}

// A blocked FEDERATED remote video as the remote block-list serves it: origin
// identity instead of a local channel, and the origin's watch page for review
// (the local /remote/{id} surface 404s while blocked).
function blockedRemote(id: string, title: string) {
  return {
    remote_video_id: id,
    title,
    object_url: `https://videos.example/videos/${id}`,
    watch_url: `https://videos.example/w/${id}`,
    channel_handle: "films@videos.example",
    domain: "videos.example",
    reason: `reason-${id}`,
    blocked_by: "e2eadmin",
    blocked_at: new Date().toISOString(),
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("mod@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("anonymous viewers are gated out of the block-list", async ({ page }) => {
  let fetched = false;
  await page.route(BLOCKED, (route) => {
    fetched = true;
    return route.fulfill({ json: { videos: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation/blocked");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees the blocked-video list via the moderation tabs", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(BLOCKED, (route) =>
    route.fulfill({
      json: { videos: [blocked("v1", "Bad clip"), blocked("v2", "Worse clip")], limit: 100, offset: 0 },
    }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Blocked videos" }).click();

  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Worse clip" })).toBeVisible();
  await expect(page.getByText("Reason: reason-v1")).toBeVisible();
  await expect(page.getByText("by e2eadmin").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Unblock" })).toHaveCount(2);
});

test("anonymous viewers are gated out of the remote block-list too", async ({ page }) => {
  let fetched = false;
  await page.route(REMOTE_BLOCKED, (route) => {
    fetched = true;
    return route.fulfill({ json: { videos: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation/blocked/remote");
  await expect(page.getByText("Moderators only")).toBeVisible();
  // The Local/Remote origin tabs self-hide behind the gate.
  await expect(page.getByRole("navigation", { name: "Blocked video origin" })).toHaveCount(0);
  expect(fetched).toBe(false);
});

test("the Remote tab lists blocked remote videos with their origin identity", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(BLOCKED, (route) =>
    route.fulfill({ json: { videos: [blocked("v1", "Bad local clip")], limit: 100, offset: 0 } }),
  );
  await page.route(REMOTE_BLOCKED, (route) =>
    route.fulfill({
      json: { videos: [blockedRemote("rv1", "Bad remote clip")], limit: 100, offset: 0 },
    }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Blocked videos" }).click();
  // The Local tab shows local rows only.
  await expect(page.getByRole("link", { name: "Bad local clip" })).toBeVisible();
  await expect(page.getByText("Bad remote clip")).toHaveCount(0);

  await page.getByRole("link", { name: "Remote", exact: true }).click();

  // Remote row: origin channel identity + domain, review link OUT to the origin
  // (the local /remote/{id} page is hidden while blocked), reason, and who blocked.
  const originLink = page.getByRole("link", { name: "Bad remote clip" });
  await expect(originLink).toHaveAttribute("href", "https://videos.example/w/rv1");
  await expect(originLink).toHaveAttribute("target", "_blank");
  await expect(originLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("films@videos.example")).toBeVisible();
  await expect(page.getByText("Reason: reason-rv1")).toBeVisible();
  await expect(page.getByText("by e2eadmin")).toBeVisible();
  // The local row does not leak into the remote list.
  await expect(page.getByRole("link", { name: "Bad local clip" })).toHaveCount(0);
});

test("unblocking a remote video removes it from the remote list", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REMOTE_BLOCKED, (route) =>
    route.fulfill({
      json: { videos: [blockedRemote("rv1", "Bad remote clip")], limit: 100, offset: 0 },
    }),
  );
  const unblockCalls: string[] = [];
  await page.route(REMOTE_UNBLOCK, (route) => {
    unblockCalls.push(`${route.request().method()} ${route.request().url()}`);
    return route.fulfill({ status: 204, body: "" });
  });

  // Client-side navigation keeps the in-memory session.
  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Blocked videos" }).click();
  await page.getByRole("link", { name: "Remote", exact: true }).click();
  await expect(page.getByRole("link", { name: "Bad remote clip" })).toBeVisible();

  const unblocked = page.waitForResponse(
    (r) => REMOTE_UNBLOCK.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unblock Bad remote clip" }).click();
  await unblocked;

  await expect(page.getByRole("link", { name: "Bad remote clip" })).toHaveCount(0);
  await expect(page.getByText("No blocked remote videos")).toBeVisible();
  expect(unblockCalls[0]).toContain("DELETE ");
  expect(unblockCalls[0]).toContain("/api/v1/admin/remote-videos/rv1/block");
});

test("unblocking a video removes it from the list", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(BLOCKED, (route) =>
    route.fulfill({ json: { videos: [blocked("v1", "Bad clip")], limit: 100, offset: 0 } }),
  );
  await page.route(UNBLOCK, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Blocked videos" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();

  const unblocked = page.waitForResponse(
    (r) => UNBLOCK.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unblock" }).click();
  await unblocked;

  await expect(page.getByRole("link", { name: "Bad clip" })).toHaveCount(0);
  await expect(page.getByText("No blocked videos")).toBeVisible();
});
