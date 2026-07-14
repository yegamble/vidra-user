import { expect, test, type Page } from "@playwright/test";

// Mocked admin users coverage (a real backend is not running in `npm run ci`; the
// persistence round-trip is proven in e2e-backed/admin-users.spec.ts). The suite
// runs at the desktop viewport, where the design's admin console (DR12) renders
// the users TABLE → user DETAIL master-detail; the mobile inline-control cards
// (DR11) live in a `lg:hidden` subtree and are covered by the responsive shell.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const USERS = /\/api\/v1\/admin\/users(\?|$)/;
const UPDATE = /\/api\/v1\/admin\/users\/[^/]+$/;
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

function adminUser(
  id: string,
  username: string,
  role: Role,
  is_active = true,
  email_verified = true,
) {
  return {
    id,
    username,
    email: `${username}@example.test`,
    role,
    is_active,
    email_verified,
    bypass_quarantine: false,
    display_name: username,
    storage_used_bytes: 2 * 1024 ** 3,
    storage_quota_bytes: null,
    created_at: new Date().toISOString(),
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  // The desktop console's Queues badge reads the open-reports count on every
  // admin page — keep it hermetic (empty) so it never hits a real backend.
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [], limit: 100, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("boss@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

// Reach /admin/users via the console entry point (client-side nav keeps the
// in-memory session) and return the desktop table/detail region locator.
async function openUsers(page: Page) {
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  const desktop = page.getByTestId("admin-users-desktop");
  await expect(desktop).toBeVisible();
  return desktop;
}

test("anonymous viewers are gated out of admin users", async ({ page }) => {
  let fetched = false;
  await page.route(USERS, (route) => {
    fetched = true;
    return route.fulfill({ json: { users: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/users");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a regular signed-in user gets no admin nav entry and is gated from admin users", async ({
  page,
}) => {
  await signIn(page, "user");
  // No Admin entry point in the primary nav for a non-admin.
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);

  let fetched = false;
  await page.route(USERS, (route) => {
    fetched = true;
    return route.fulfill({ json: { users: [], limit: 20, offset: 0 } });
  });
  await page.goto("/admin/users");
  await expect(page.getByText("Administrators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("moderators see Moderation but not the Admin nav entry", async ({ page }) => {
  await signIn(page, "moderator");
  await expect(page.getByRole("link", { name: "Moderation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});

test("an admin sees the users table with a self marker and a self-guarded detail", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: {
        users: [
          adminUser("u1", "boss", "admin"),
          adminUser("u2", "alice", "user"),
          adminUser("u3", "bob", "moderator"),
        ],
        limit: 100,
        offset: 0,
      },
    }),
  );

  const desktop = await openUsers(page);
  await expect(desktop.getByText("alice@example.test")).toBeVisible();
  await expect(desktop.getByText("bob@example.test")).toBeVisible();
  await expect(desktop.getByText("you", { exact: true })).toBeVisible();

  // The admin's own detail is display-only for role (no editable segmented
  // control — the backend forbids self-demote) and its status/delete are disabled.
  await desktop.getByRole("button", { name: "Open boss" }).click();
  await expect(page.getByRole("group", { name: "Role for boss" })).toHaveCount(0);
  await expect(
    desktop.getByText("You can't change your own role or status, or delete your own account."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate boss" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete boss permanently" })).toBeDisabled();

  // Back returns to the table.
  await page.getByRole("button", { name: "All users" }).click();
  await expect(desktop.getByText("alice@example.test")).toBeVisible();
});

test("the search box filters by query", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) => {
    const filtered = route.request().url().includes("q=alice");
    const users = filtered
      ? [adminUser("u2", "alice", "user")]
      : [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")];
    return route.fulfill({ json: { users, limit: 100, offset: 0 } });
  });

  const desktop = await openUsers(page);
  await expect(desktop.getByText("alice@example.test")).toBeVisible();

  const searched = page.waitForResponse((r) => USERS.test(r.url()) && r.url().includes("q=alice"));
  await page.getByRole("searchbox", { name: "Search users" }).fill("alice");
  await page.getByRole("button", { name: "Search" }).click();
  await searched;
  await expect(desktop.getByText("boss@example.test")).toHaveCount(0);
  await expect(desktop.getByText("alice@example.test")).toBeVisible();
});

test("an admin can change a user's role via the segmented control in the detail", async ({
  page,
}) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: { users: [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")], limit: 100, offset: 0 },
    }),
  );
  await page.route(UPDATE, (route) =>
    route.fulfill({ json: adminUser("u2", "alice", "moderator") }),
  );

  const desktop = await openUsers(page);
  await desktop.getByRole("button", { name: "Open alice" }).click();

  const role = page.getByRole("group", { name: "Role for alice" });
  await expect(role.getByRole("button", { name: "User" })).toHaveAttribute("aria-pressed", "true");

  const updated = page.waitForResponse(
    (r) => UPDATE.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await role.getByRole("button", { name: "Moderator" }).click();
  await updated;
  await expect(role.getByRole("button", { name: "Moderator" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("an admin can set and reset a user's storage quota override", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: { users: [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")], limit: 100, offset: 0 },
    }),
  );
  let lastQuota: number | null | undefined;
  await page.route(UPDATE, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as { storage_quota_bytes?: number | null };
    lastQuota = body.storage_quota_bytes;
    const overridden = { ...adminUser("u2", "alice", "user"), storage_quota_bytes: body.storage_quota_bytes ?? null };
    return route.fulfill({ json: overridden });
  });

  const desktop = await openUsers(page);
  await desktop.getByRole("button", { name: "Open alice" }).click();

  // Alice starts on the instance default (no override) → only "Change quota".
  await expect(page.getByRole("button", { name: "Change storage quota for alice" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset alice to the instance default quota" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Change storage quota for alice" }).click();
  await page.getByRole("spinbutton", { name: "Storage quota in GB for alice" }).fill("50");
  const saved = page.waitForResponse(
    (r) => UPDATE.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save storage quota for alice" }).click();
  await saved;
  expect(lastQuota).toBe(50 * 1024 ** 3);

  // The override now shows a Reset control; resetting sends null.
  const reset = page.getByRole("button", { name: "Reset alice to the instance default quota" });
  await expect(reset).toBeVisible();
  const wasReset = page.waitForResponse(
    (r) => UPDATE.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await reset.click();
  await wasReset;
  expect(lastQuota).toBeNull();
});

test("an admin can deactivate a user", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: { users: [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")], limit: 100, offset: 0 },
    }),
  );
  await page.route(UPDATE, (route) =>
    route.fulfill({ json: adminUser("u2", "alice", "user", false) }),
  );

  const desktop = await openUsers(page);
  await desktop.getByRole("button", { name: "Open alice" }).click();

  const updated = page.waitForResponse(
    (r) => UPDATE.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Deactivate alice" }).click();
  await updated;
  await expect(page.getByRole("button", { name: "Reactivate alice" })).toBeVisible();
});

test("an admin can permanently delete a user after the double confirm", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: { users: [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")], limit: 100, offset: 0 },
    }),
  );
  let deletedUrl = "";
  await page.route(UPDATE, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deletedUrl = route.request().url();
    return route.fulfill({ status: 204, body: "" });
  });

  const desktop = await openUsers(page);
  await desktop.getByRole("button", { name: "Open alice" }).click();

  // Step 1: arm the delete for alice.
  await page.getByRole("button", { name: "Delete alice permanently" }).click();
  const confirm = page.getByRole("button", { name: "Confirm permanent deletion of alice" });
  await expect(confirm).toBeDisabled(); // nothing typed yet

  // Step 2: the confirm stays disabled until the exact username is typed.
  await page.getByLabel("Type alice to confirm deletion").fill("alicia");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type alice to confirm deletion").fill("alice");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // The detail closes back to the table; alice is gone, the others stay.
  await expect(desktop.getByText("alice@example.test")).toHaveCount(0);
  await expect(desktop.getByText("boss@example.test")).toBeVisible();
  expect(deletedUrl).toContain("/api/v1/admin/users/u2");
});

test("cancelling the admin delete keeps the user", async ({ page }) => {
  await signIn(page, "admin");
  await page.route(USERS, (route) =>
    route.fulfill({
      json: { users: [adminUser("u1", "boss", "admin"), adminUser("u2", "alice", "user")], limit: 100, offset: 0 },
    }),
  );
  let deleted = false;
  await page.route(UPDATE, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    deleted = true;
    return route.fulfill({ status: 204, body: "" });
  });

  const desktop = await openUsers(page);
  await desktop.getByRole("button", { name: "Open alice" }).click();
  await page.getByRole("button", { name: "Delete alice permanently" }).click();
  await page.getByLabel("Type alice to confirm deletion").fill("alice");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByLabel("Type alice to confirm deletion")).toHaveCount(0);
  await expect(desktop.getByText("alice@example.test")).toBeVisible();
  expect(deleted).toBe(false);
});
