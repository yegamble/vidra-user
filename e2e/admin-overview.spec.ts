import { expect, test, type Page } from "@playwright/test";

// Mocked admin overview coverage (a real backend is not running in `npm run ci`).
// The overview is read-only composition over four already backed-verified reads
// (GET /admin/system, /admin/jobs, /admin/audit-log, /admin/reports), so mocked
// coverage is sufficient here.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const SYSTEM = /\/api\/v1\/admin\/system$/;
const STATS = /\/api\/v1\/admin\/stats$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;
const JOBS = /\/api\/v1\/admin\/jobs$/;
const AUDIT = /\/api\/v1\/admin\/audit-log(\?|$)/;

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

const systemStatus = {
  status: "ok",
  software: {
    name: "vidra",
    version: "0.1.0",
    commit: "abc1234",
    build_date: "2026-07-01T00:00:00Z",
    go_version: "go1.26.2",
  },
  environment: "production",
  uptime_seconds: 90061, // 1d 1h 1m
  components: { postgres: { status: "ok" }, redis: { status: "ok" } },
};

// GET /admin/stats — the design's four aggregate stat cards. Real live counts;
// the extra `comments` field is intentionally not rendered as a card.
const adminStats = {
  users: 2847,
  published_videos: 1240,
  media_stored_bytes: 512 * 1024 ** 3, // 512.0 GB
  federated_peers: 37,
  comments: 15803,
};

const jobsOverview = {
  queues: [
    {
      queue: "transcode_jobs",
      pending: 3,
      running: 1,
      done: 42,
      failed: 0,
      oldest_pending_age_seconds: 120,
    },
    {
      queue: "caption_jobs",
      pending: 0,
      running: 0,
      done: 10,
      failed: 2,
      oldest_pending_age_seconds: 0,
    },
  ],
  recent_failures: [],
};

const auditLog = {
  entries: [
    {
      id: "a1",
      action: "admin.registration.approve",
      result: "success",
      actor_username: "mira",
      occurred_at: new Date().toISOString(),
    },
  ],
  limit: 6,
  offset: 0,
};

function report(id: string) {
  return {
    id,
    target_type: "video",
    reason: "spam",
    status: "open",
    moderator_note: "",
    created_at: new Date().toISOString(),
    reporter: { username: "viewer" },
    video_id: "v1",
    video_title: "Reported clip",
  };
}

function reports(n: number) {
  return {
    reports: Array.from({ length: n }, (_, i) => report(`r${i}`)),
    limit: 100,
    offset: 0,
  };
}

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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Reach /admin via client-side navigation so the in-memory session survives:
// the sidebar Admin entry lands directly on the console home (the Overview).
async function openOverview(page: Page) {
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
}

test("anonymous viewers are gated out of the admin overview", async ({ page }) => {
  let fetched = false;
  for (const rx of [SYSTEM, STATS, REPORTS, JOBS, AUDIT]) {
    await page.route(rx, (route) => {
      fetched = true;
      return route.fulfill({ json: {} });
    });
  }
  await page.goto("/admin");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees the health, queues, audit, open-reports, and section cards", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SYSTEM, (route) => route.fulfill({ json: systemStatus }));
  await page.route(STATS, (route) => route.fulfill({ json: adminStats }));
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(3) }));
  await page.route(JOBS, (route) => route.fulfill({ json: jobsOverview }));
  await page.route(AUDIT, (route) => route.fulfill({ json: auditLog }));

  await openOverview(page);

  // Instance overview stat cards — GET /admin/stats (real counts, no deltas).
  const overview = page.getByRole("region", { name: "Instance overview" });
  await expect(overview.getByText("Users", { exact: true })).toBeVisible();
  await expect(overview.getByText("2.8K")).toBeVisible();
  await expect(overview.getByText("Published videos")).toBeVisible();
  await expect(overview.getByText("1.2K")).toBeVisible();
  await expect(overview.getByText("Media stored")).toBeVisible();
  await expect(overview.getByText("512.0 GB")).toBeVisible();
  await expect(overview.getByText("Federated peers")).toBeVisible();
  await expect(overview.getByText("37", { exact: true })).toBeVisible();

  // Health card — reuses GET /admin/system (overall flag + dependency rows).
  const health = page.getByRole("region", { name: "Health" });
  await expect(health.getByText("Healthy")).toBeVisible();
  await expect(health.getByText("vidra 0.1.0")).toBeVisible();
  await expect(health.getByText("up 1d 1h 1m")).toBeVisible();
  await expect(health.getByText("Postgres")).toBeVisible();
  await expect(health.getByText("Redis")).toBeVisible();

  // Job queues card — GET /admin/jobs.
  const queues = page.getByRole("region", { name: "Job queues" });
  await expect(queues.getByText("Transcode jobs")).toBeVisible();
  await expect(queues.getByText("3 pending · oldest 2m")).toBeVisible();
  await expect(queues.getByText("2 failed")).toBeVisible();

  // Recent audit log card — GET /admin/audit-log.
  const audit = page.getByRole("region", { name: "Recent audit log" });
  await expect(audit.getByText("mira")).toBeVisible();
  await expect(audit.getByText("admin.registration.approve")).toBeVisible();

  // Open-reports lead-in from GET /admin/reports?status=open. It surfaces both in
  // the desktop console's Queues badge and the overview callout link.
  await expect(
    page.getByRole("navigation", { name: "Admin console" }).getByText("3"),
  ).toBeVisible();
  await expect(page.getByText("open reports")).toBeVisible();
  await expect(page.getByRole("link", { name: "Moderation queue" })).toBeVisible();

  // Section cards link to each admin surface.
  const cards = page.getByRole("region", { name: "Admin sections" });
  for (const label of ["Users", "Registration", "Audit log", "System"]) {
    await expect(cards.getByText(label, { exact: true })).toBeVisible();
  }
  await cards.getByRole("link", { name: /Search accounts/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
});

test("a full first page of open reports renders as 100+", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SYSTEM, (route) => route.fulfill({ json: systemStatus }));
  await page.route(STATS, (route) => route.fulfill({ json: adminStats }));
  await page.route(JOBS, (route) => route.fulfill({ json: jobsOverview }));
  await page.route(AUDIT, (route) => route.fulfill({ json: auditLog }));
  // The list carries no total, so a full page is shown as a lower bound.
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(100) }));

  await openOverview(page);

  await expect(page.getByText("100+", { exact: true })).toBeVisible();
});

test("a failed health read shows a retryable error without hiding the reports count", async ({
  page,
}) => {
  await signIn(page, "admin");
  let systemCalls = 0;
  await page.route(SYSTEM, (route) => {
    systemCalls += 1;
    if (systemCalls === 1) {
      return route.fulfill({
        status: 500,
        json: { error: { code: "internal", message: "boom" } },
      });
    }
    return route.fulfill({ json: systemStatus });
  });
  await page.route(STATS, (route) => route.fulfill({ json: adminStats }));
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(0) }));
  await page.route(JOBS, (route) => route.fulfill({ json: jobsOverview }));
  await page.route(AUDIT, (route) => route.fulfill({ json: auditLog }));

  await openOverview(page);

  await expect(page.getByText("Could not load the system health.")).toBeVisible();
  await expect(page.getByText("No open reports.")).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Healthy")).toBeVisible();
});
