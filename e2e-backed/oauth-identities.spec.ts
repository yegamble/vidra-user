import { expect, test } from "@playwright/test";

import { uniqueId } from "./fixtures";

// Backend-backed e2e (read-only wire-up): the /settings "Connected logins"
// section reads GET /me/oauth-identities AND GET /instance against the real
// backend. A full link/unlink round trip needs a real OIDC provider in the
// stack, which the plain backed compose does not have — that flow is
// provider-gated (recorded in .ralph/fix_plan.md); this proves the endpoint
// wiring plus the empty state.
//
// The empty state now answers the question an operator's instance actually
// poses. The section lists every provider the instance OFFERS, not only what
// the account has linked, because connecting a provider from here is the only
// linking path there is (a provider-asserted email no longer links anything).
// On this stack `oauth_providers` is empty and ATProto login is off, so the
// honest sentence is that there is nothing to connect — not that this ACCOUNT
// has connected nothing, which would read as a gap the person could close.
test("connected logins loads (empty) from the real backend", async ({ page }) => {
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`oid${id}`);
  await page.getByLabel("Email").fill(`e2e-oid-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Connected logins" })).toBeVisible();
  await expect(
    page.getByText("This instance does not offer any external sign-in providers."),
  ).toBeVisible();
  // …and there is nothing to click, because there is nothing configured.
  await expect(page.getByRole("button", { name: /^Connect / })).toHaveCount(0);
});
