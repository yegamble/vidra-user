import { expect, test, type Page } from "@playwright/test";

// Mocked moderation-queue coverage (a real backend is not running in `npm run ci`;
// the persistence round-trip is proven in e2e-backed/moderation.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;
const RESOLVE = /\/api\/v1\/admin\/reports\/[^/]+\/resolve$/;
const REPORT_ONE = /\/api\/v1\/admin\/reports\/[^/]+$/;
const BLOCK = /\/api\/v1\/admin\/videos\/[^/]+\/block$/;

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

function videoReport(id: string, status: string) {
  return {
    id,
    target_type: "video",
    reason: `reason-${id}`,
    status,
    moderator_note: "",
    created_at: new Date().toISOString(),
    reporter: { username: "alice" },
    video_id: "v1",
    video_title: "Bad clip",
  };
}

function commentReport(id: string, status: string) {
  return {
    id,
    target_type: "comment",
    reason: `reason-${id}`,
    status,
    moderator_note: "",
    created_at: new Date().toISOString(),
    reporter: { username: "bob" },
    comment_id: "c1",
    comment_body: "nasty comment",
  };
}

// A report against a FEDERATED remote video (target_type remote_video) with its
// origin context, as the queue serves it.
function remoteVideoReport(id: string, status: string) {
  return {
    id,
    target_type: "remote_video",
    reason: `reason-${id}`,
    status,
    moderator_note: "",
    created_at: new Date().toISOString(),
    reporter: { username: "carol" },
    remote_video_id: "rv9",
    remote_video_title: "Suspicious remote clip",
    remote_video_domain: "videos.example",
  };
}

// A report against a DIRECT MESSAGE (target_type message) carrying the
// snapshotted body (which survives a sender tombstone), as the queue serves it.
function messageReport(id: string, status: string) {
  return {
    id,
    target_type: "message",
    reason: `reason-${id}`,
    status,
    moderator_note: "",
    created_at: new Date().toISOString(),
    reporter: { username: "dave" },
    message_id: "m7",
    message_body: "abusive DM text",
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

test("anonymous viewers are gated out of the moderation queue", async ({ page }) => {
  let fetched = false;
  await page.route(REPORTS, (route) => {
    fetched = true;
    return route.fulfill({ json: { reports: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("regular users do not see the Moderation nav entry", async ({ page }) => {
  await signIn(page, "user");
  await expect(page.getByRole("link", { name: "Moderation" })).toHaveCount(0);
});

test("an admin sees the open report queue", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) =>
    route.fulfill({
      json: { reports: [videoReport("r1", "open"), commentReport("r2", "open")], limit: 100, offset: 0 },
    }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();
  await expect(page.getByText("nasty comment")).toBeVisible();
  await expect(page.getByText("by alice")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(2);
});

test("accepting a report removes it from the open queue", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) =>
    route.fulfill({
      json: { reports: [videoReport("r1", "open"), commentReport("r2", "open")], limit: 100, offset: 0 },
    }),
  );
  await page.route(RESOLVE, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "Moderation" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();

  const resolved = page.waitForResponse(
    (r) => RESOLVE.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Accept" }).first().click();
  await resolved;

  // The video report (r1) was open; resolving drops it from the open-only view.
  await expect(page.getByRole("link", { name: "Bad clip" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(1);
});

test("an admin blocks the video from a report card", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [videoReport("r1", "open")], limit: 100, offset: 0 } }),
  );
  let blockedVideoId: string | null = null;
  await page.route(BLOCK, (route) => {
    if (route.request().method() === "POST") {
      blockedVideoId = route.request().url().match(/\/videos\/([^/]+)\/block$/)?.[1] ?? null;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  await page.getByRole("link", { name: "Moderation" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();

  const blocked = page.waitForResponse(
    (r) => BLOCK.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Block video" }).click();
  await blocked;

  // The card reflects the block and offers a link to manage it.
  await expect(page.getByText("Video blocked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage" })).toBeVisible();
  expect(blockedVideoId).toBe("v1");
});

test("a remote-video report shows origin context and blocks the remote video", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [remoteVideoReport("r1", "open")], limit: 100, offset: 0 } }),
  );
  let blockedRemoteId: string | null = null;
  let blockBody: unknown = null;
  await page.route(/\/api\/v1\/admin\/remote-videos\/[^/]+\/block$/, (route) => {
    if (route.request().method() === "POST") {
      blockedRemoteId =
        route.request().url().match(/\/remote-videos\/([^/]+)\/block$/)?.[1] ?? null;
      blockBody = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  await page.getByRole("link", { name: "Moderation" }).click();

  // The card renders the "remote video" type pill, the origin, and a local
  // remote-watch review link.
  await expect(page.getByText("remote video", { exact: true })).toBeVisible();
  await expect(page.getByText("videos.example")).toBeVisible();
  await expect(page.getByText("by carol")).toBeVisible();
  await expect(page.getByRole("link", { name: "Suspicious remote clip" })).toHaveAttribute(
    "href",
    "/remote/rv9",
  );

  // Block the remote video from the card, carrying the report reason for audit.
  const blocked = page.waitForResponse(
    (r) =>
      /\/api\/v1\/admin\/remote-videos\/[^/]+\/block$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByRole("button", { name: "Block video" }).click();
  await blocked;

  await expect(page.getByText("Video blocked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage" })).toHaveAttribute(
    "href",
    "/moderation/blocked/remote",
  );
  expect(blockedRemoteId).toBe("rv9");
  expect(blockBody).toEqual({ reason: "reason-r1" });
});

test("a direct-message report shows the snapshotted body in the queue", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [messageReport("r1", "open")], limit: 100, offset: 0 } }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();

  // The card renders the "message" type pill, the snapshotted body, and the
  // reporter — but no block action (messages have no block, only resolve).
  await expect(page.getByText("message", { exact: true })).toBeVisible();
  await expect(page.getByText("abusive DM text")).toBeVisible();
  await expect(page.getByText("Direct message")).toBeVisible();
  await expect(page.getByText("by dave")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Block video" })).toHaveCount(0);
});

test("the All filter shows resolved reports without resolve actions", async ({ page }) => {
  await signIn(page, "admin");
  // open → only the still-open comment report; all → both (video already accepted).
  await page.route(REPORTS, (route) => {
    const openOnly = route.request().url().includes("status=open");
    const reports = openOnly
      ? [commentReport("r2", "open")]
      : [videoReport("r1", "accepted"), commentReport("r2", "open")];
    return route.fulfill({ json: { reports, limit: 100, offset: 0 } });
  });

  await page.getByRole("link", { name: "Moderation" }).click();
  await expect(page.getByText("nasty comment")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bad clip" })).toHaveCount(0);

  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();
  await expect(page.getByText("accepted")).toBeVisible();
  // Only the still-open comment report keeps its resolve actions.
  await expect(page.getByRole("button", { name: "Accept" })).toHaveCount(1);
});

test("an admin can hard-delete a resolved report from the All view", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(REPORTS, (route) => {
    const openOnly = route.request().url().includes("status=open");
    const reports = openOnly
      ? [commentReport("r2", "open")]
      : [videoReport("r1", "accepted"), commentReport("r2", "open")];
    return route.fulfill({ json: { reports, limit: 100, offset: 0 } });
  });
  let deletedId: string | null = null;
  await page.route(REPORT_ONE, (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = route.request().url().match(/\/reports\/([^/]+)$/)?.[1] ?? null;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();

  // Delete lives only on the resolved card; the open one keeps resolve actions.
  await expect(page.getByRole("button", { name: "Delete this video report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete this comment report" })).toHaveCount(0);

  const deleted = page.waitForResponse(
    (r) => REPORT_ONE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Delete this video report" }).click();
  await expect(page.getByText("Permanently delete this report?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await deleted;

  // The purged row is gone; the open report remains.
  await expect(page.getByRole("link", { name: "Bad clip" })).toHaveCount(0);
  await expect(page.getByText("nasty comment")).toBeVisible();
  expect(deletedId).toBe("r1");
});

test("moderators do not get the report Delete control", async ({ page }) => {
  await signIn(page, "moderator");
  await page.route(REPORTS, (route) =>
    route.fulfill({
      json: { reports: [videoReport("r1", "accepted")], limit: 100, offset: 0 },
    }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByRole("link", { name: "Bad clip" })).toBeVisible();
  // Hard-delete is an admin-only purge — moderators resolve but cannot delete.
  await expect(page.getByRole("button", { name: /Delete this .* report/ })).toHaveCount(0);
});
