import { expect, test, type Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, adminToken, adminUsers, registerUser } from "./fixtures";

// Submit the admin users search (the pill AdminSearch toolbar: a "Search users"
// searchbox + a "Search" submit button).
async function searchUsers(page: Page, username: string) {
  await page.getByRole("searchbox", { name: "Search users" }).fill(username);
  await page.getByRole("button", { name: "Search" }).click();
}

// Proves the admin user-management round trip against a real vidra-core + PostgreSQL:
// a fresh account is seeded via the API, the deterministic admin logs in through the
// UI, finds the account, promotes it to moderator and then deactivates it — and a
// fresh authed refetch (plus a direct admin API read) confirms both mutations
// persisted (users.role → moderator, users.is_active → false).
test("an admin promotes then deactivates a user, and it persists", async ({ page, request }) => {
  const target = await registerUser(request);

  const token = await adminToken(request);
  const before = (await adminUsers(request, token, target.username))[0];
  expect(before?.role).toBe("user");
  expect(before?.is_active).toBe(true);

  // The deterministic admin logs in through the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Open the admin console (client-side nav keeps the in-memory session) and
  // search for the seeded account (scopes the list to one row).
  await page.getByRole("link", { name: "Admin", exact: true }).click();

  // The DR11/DR12 users surface renders BOTH layouts in the DOM at once: mobile
  // per-user cards (`lg:hidden`) and the desktop table → detail
  // (`data-testid="admin-users-desktop"`, `hidden lg:block`). At the Desktop
  // Chrome viewport only the desktop one is visible, so scope every users
  // interaction to it — otherwise email/role/action queries also match the hidden
  // mobile duplicates (strict-mode violations).
  const desktop = page.getByTestId("admin-users-desktop");

  await searchUsers(page, target.username);
  await expect(desktop.getByText(target.email)).toBeVisible();

  // The desktop console is a master → detail table: open the user's detail.
  await desktop.getByRole("button", { name: `Open ${target.username}` }).click();

  // Promote to moderator. The role control is now the design's SegmentedControl —
  // a role=group of aria-pressed toggle buttons (was a <select>) — so pick the
  // "Moderator" segment and assert it via aria-pressed (not a select value).
  const roleGroup = () => desktop.getByRole("group", { name: `Role for ${target.username}` });
  const promoted = page.waitForResponse(
    (r) => /\/admin\/users\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await roleGroup().getByRole("button", { name: "Moderator" }).click();
  await promoted;
  await expect(roleGroup().getByRole("button", { name: "Moderator" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Deactivate (from the same open detail).
  const deactivated = page.waitForResponse(
    (r) => /\/admin\/users\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await desktop.getByRole("button", { name: `Deactivate ${target.username}` }).click();
  await deactivated;
  await expect(desktop.getByRole("button", { name: `Reactivate ${target.username}` })).toBeVisible();

  // Persisted across a fresh refetch. On /admin the console rail replaces the
  // global sidebar (no "Home" link here), so leave to the app via the console's
  // "back to the app" wordmark, then re-enter Admin from the app sidebar — a
  // fresh AdminUsersView mount refetches from the DB.
  await page.getByRole("link", { name: /back to the app/ }).click();
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await searchUsers(page, target.username);
  await desktop.getByRole("button", { name: `Open ${target.username}` }).click();
  await expect(roleGroup().getByRole("button", { name: "Moderator" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(desktop.getByRole("button", { name: `Reactivate ${target.username}` })).toBeVisible();

  // Persisted in the database (admin API read).
  const after = (await adminUsers(request, token, target.username))[0];
  expect(after?.role).toBe("moderator");
  expect(after?.is_active).toBe(false);
});
