import { expect, test, type Page } from "@playwright/test";

// Mocked admin jobs/worker-status coverage (a real backend is not running in
// `npm run ci`; the read against the real stack is a read-only page).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const JOBS = /\/api\/v1\/admin\/jobs$/;

type Role = "user" | "moderator" | "admin";

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

const jobs = {
  queues: [
    {
      queue: "transcode_jobs",
      pending: 2,
      running: 1,
      done: 40,
      failed: 0,
      oldest_pending_age_seconds: 45,
    },
    {
      queue: "federation_deliveries",
      pending: 0,
      running: 0,
      done: 100,
      failed: 3,
      oldest_pending_age_seconds: 0,
    },
  ],
  recent_failures: [
    {
      queue: "federation_deliveries",
      id: "11111111-1111-1111-1111-111111111111",
      error: "connection refused",
      attempts: 5,
      failed_at: "2026-07-03T10:00:00Z",
    },
  ],
};

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function openJobs(page: Page) {
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Jobs" }).click();
}

test("anonymous viewers are gated out of the jobs page", async ({ page }) => {
  let fetched = false;
  await page.route(JOBS, (route) => {
    fetched = true;
    return route.fulfill({ json: jobs });
  });
  await page.goto("/admin/jobs");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular user gets no admin entry and is gated from jobs", async ({ page }) => {
  await signIn(page, "user");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(JOBS, (route) => {
    fetched = true;
    return route.fulfill({ json: jobs });
  });
  await page.goto("/admin/jobs");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees per-queue cards, recent failures, and can refresh", async ({ page }) => {
  await signIn(page, "admin");
  let calls = 0;
  await page.route(JOBS, (route) => {
    calls += 1;
    return route.fulfill({ json: jobs });
  });
  await openJobs(page);

  // Per-queue cards (scoped to the queue grid — the queue name also appears in
  // the failures table below).
  const queueList = page.getByRole("list", { name: "Job queues" });
  await expect(queueList.getByText("transcode_jobs")).toBeVisible();
  await expect(queueList.getByText("federation_deliveries")).toBeVisible();
  // The failed queue is flagged.
  await expect(page.getByText("3 failed")).toBeVisible();

  // Recent-failures table.
  await expect(page.getByRole("heading", { name: "Recent failures" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "connection refused" })).toBeVisible();

  // Refresh re-reads the snapshot.
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(queueList.getByText("transcode_jobs")).toBeVisible();
});
