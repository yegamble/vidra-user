import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

// Backend-backed e2e (real vidra-core + Postgres, no mocks): proves account
// deactivation persists. Sign up → deactivate (with password confirm) → the
// account is signed out, and a fresh login with the same credentials is refused
// ("account is disabled") — which can only happen if the DB row was disabled.
// Unique email per run so it is repeatable without a DB reset.
test("deactivating the account prevents future logins", async ({ page }) => {
  // A per-test unique id avoids collisions when the backed specs run in parallel.
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const username = `e2ed${id}`;
  const email = `e2e-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Deactivate via the settings page (reached through the header link).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await page.getByLabel("Current password").fill(password);
  await page.getByRole("button", { name: "Deactivate account" }).click();

  // Deactivation signs the account out everywhere. The account-menu trigger is
  // a signed-in-only control, so its absence is unambiguous even though several
  // signed-out views render their own "Sign in" link.
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeHidden();

  // A fresh login with the same credentials is refused — proof the deactivation
  // persisted in the database.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("account is disabled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
});
