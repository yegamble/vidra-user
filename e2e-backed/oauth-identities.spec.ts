import { expect, test } from "@playwright/test";

import { uniqueId } from "./fixtures";

// Backend-backed e2e (read-only wire-up): the /settings "Connected logins"
// section reads GET /me/oauth-identities against the real backend. A full
// link/unlink round trip needs a real OIDC provider in the stack, which the
// plain backed compose does not have — that flow is provider-gated (recorded
// in .ralph/fix_plan.md); this proves the endpoint wiring + empty state.
test("connected logins loads (empty) from the real backend", async ({ page }) => {
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`oid${id}`);
  await page.getByLabel("Email").fill(`e2e-oid-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: `oid${id}` }).click();
  await expect(page.getByRole("heading", { name: "Connected logins" })).toBeVisible();
  await expect(page.getByText("No external logins are linked to this account.")).toBeVisible();
});
