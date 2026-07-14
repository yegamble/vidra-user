import { expect, test, type Page } from "@playwright/test";

// Mocked admin audit-log coverage (a real backend is not running in `npm run ci`;
// the read against real audit rows is proven in e2e-backed/admin-audit.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
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

function entry(id: string, action: string, result: "success" | "failure", actor_username?: string) {
  return { id, action, result, actor_username, reason: "", occurred_at: new Date().toISOString() };
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

test("anonymous viewers are gated out of the audit log", async ({ page }) => {
  let fetched = false;
  await page.route(AUDIT, (route) => {
    fetched = true;
    return route.fulfill({ json: { entries: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/audit-log");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular signed-in user gets no admin nav entry and is gated from the audit log", async ({
  page,
}) => {
  await signIn(page, "user");
  // No Admin entry point in the primary nav for a non-admin.
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(AUDIT, (route) => {
    fetched = true;
    return route.fulfill({ json: { entries: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/audit-log");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("an admin sees the audit log and can filter by action", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) => route.fulfill({ json: { users: [], limit: 100, offset: 0 } }));
  await page.route(AUDIT, (route) => {
    const filtered = route.request().url().includes("action=auth.login");
    const entries = filtered
      ? [entry("a1", "auth.login", "success", "boss")]
      : [entry("a1", "auth.login", "success", "boss"), entry("a2", "auth.register", "success", "alice")];
    return route.fulfill({ json: { entries, limit: 100, offset: 0 } });
  });

  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByText("auth.register")).toBeVisible();
  await expect(page.getByText("auth.login")).toBeVisible();

  const searched = page.waitForResponse((r) => AUDIT.test(r.url()) && r.url().includes("action=auth.login"));
  await page.getByLabel("Filter by action").fill("auth.login");
  await page.getByRole("button", { name: "Filter" }).click();
  await searched;
  await expect(page.getByText("auth.register")).toHaveCount(0);
  await expect(page.getByText("auth.login")).toBeVisible();
});
