import { expect, test, type Page } from "@playwright/test";

// Mocked admin system-status coverage (a real backend is not running in `npm run
// ci`; the read against the real stack is proven in e2e-backed/admin-system.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const SYSTEM = /\/api\/v1\/admin\/system$/;

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
  components: {
    postgres: { status: "ok" },
    redis: { status: "ok" },
  },
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

test("anonymous viewers are gated out of system status", async ({ page }) => {
  let fetched = false;
  await page.route(SYSTEM, (route) => {
    fetched = true;
    return route.fulfill({ json: systemStatus });
  });
  await page.goto("/admin/system");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees the system status snapshot", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.route(SYSTEM, (route) => route.fulfill({ json: systemStatus }));

  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "System" }).click();

  await expect(page.getByText("Healthy")).toBeVisible();
  await expect(page.getByText("vidra 0.1.0")).toBeVisible();
  await expect(page.getByText("production")).toBeVisible();
  await expect(page.getByText("1d 1h 1m")).toBeVisible();
  await expect(page.getByText("postgres")).toBeVisible();
  await expect(page.getByText("redis")).toBeVisible();
});
