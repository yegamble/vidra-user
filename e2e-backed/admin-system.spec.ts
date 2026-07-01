import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./fixtures";

// Proves the admin system-status read against a real vidra-core + PostgreSQL +
// Redis (the compose stack): the deterministic admin opens the page and sees a
// healthy snapshot with the real postgres/redis dependencies reporting "ok". A
// read-only page, so this verifies the read contract against the live stack.
test("the system-status page reflects the real running stack", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Open the system status page (client-side nav keeps the in-memory session).
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "System" }).click();

  // The compose stack has a live postgres + redis, so the snapshot is healthy and
  // lists both real dependencies.
  await expect(page.getByText("Healthy")).toBeVisible();
  await expect(page.getByText("postgres")).toBeVisible();
  await expect(page.getByText("redis")).toBeVisible();
  await expect(page.getByText("Uptime")).toBeVisible();
});
