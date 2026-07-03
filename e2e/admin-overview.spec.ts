import { expect, test, type Page } from "@playwright/test";

// Mocked admin overview coverage (a real backend is not running in `npm run ci`).
// The overview is read-only composition over two already backed-verified reads
// (GET /admin/system, GET /admin/reports), so mocked coverage is sufficient here.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SYSTEM = /\/api\/v1\/admin\/system$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;

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
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Reach /admin via client-side navigation so the in-memory session survives:
// header Admin (→ /admin/users) → the Overview tab.
async function openOverview(page: Page) {
  await page.route(USERS, (route) =>
    route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
}

test("anonymous viewers are gated out of the admin overview", async ({ page }) => {
  let fetched = false;
  await page.route(SYSTEM, (route) => {
    fetched = true;
    return route.fulfill({ json: systemStatus });
  });
  await page.route(REPORTS, (route) => {
    fetched = true;
    return route.fulfill({ json: reports(0) });
  });
  await page.goto("/admin");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees the system summary, open-reports count, and section cards", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(SYSTEM, (route) => route.fulfill({ json: systemStatus }));
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(3) }));

  await openOverview(page);

  // Live system summary reusing GET /admin/system.
  await expect(page.getByText("Healthy")).toBeVisible();
  await expect(page.getByText("vidra 0.1.0")).toBeVisible();
  await expect(page.getByText("up 1d 1h 1m")).toBeVisible();

  // Open-reports count from GET /admin/reports?status=open.
  await expect(page.getByText("3", { exact: true })).toBeVisible();
  await expect(page.getByText("open reports")).toBeVisible();
  await expect(page.getByRole("link", { name: "Moderation queue" })).toBeVisible();

  // Section cards link to each admin surface.
  const cards = page.getByRole("region", { name: "Admin sections" });
  for (const label of ["Users", "Registration", "Audit log", "System"]) {
    await expect(cards.getByText(label, { exact: true })).toBeVisible();
  }

  // A card navigates to its section.
  await cards.getByRole("link", { name: /Search accounts/ }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
});

test("a full first page of open reports renders as 100+", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(SYSTEM, (route) => route.fulfill({ json: systemStatus }));
  // The list carries no total, so a full page is shown as a lower bound.
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(100) }));

  await openOverview(page);

  await expect(page.getByText("100+", { exact: true })).toBeVisible();
});

test("a failed system read shows a retryable error without hiding the reports count", async ({
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
  await page.route(REPORTS, (route) => route.fulfill({ json: reports(0) }));

  await openOverview(page);

  await expect(page.getByText("Could not load the system summary.")).toBeVisible();
  await expect(page.getByText("No open reports.")).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Healthy")).toBeVisible();
});
