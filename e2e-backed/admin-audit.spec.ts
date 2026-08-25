import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./fixtures";

// Proves the admin audit-log read against a real vidra-core + PostgreSQL: logging
// in as the deterministic admin itself writes an auth.login row to the durable
// audit trail, and the admin audit-log page lists it (and filters to it). No
// mutation is performed here — this verifies the read contract against real rows.
test("the admin audit log lists real security events", async ({ page }) => {
  // Logging in as the deterministic admin persists an auth.login audit event.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Open the audit log (client-side nav keeps the in-memory session).
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Audit log" }).click();

  // The admin's own login is in the trail (real rows from the running backend).
  await expect(page.getByText("auth.login").first()).toBeVisible();

  // Filtering by that action re-reads from the backend and keeps auth.login.
  const filtered = page.waitForResponse(
    (r) => /\/admin\/audit-log\?.*action=auth\.login/.test(r.url()) && r.ok(),
  );
  await page.getByLabel("Filter by action").fill("auth.login");
  await page.getByRole("button", { name: "Search" }).click();
  await filtered;
  await expect(page.getByText("auth.login").first()).toBeVisible();
});
