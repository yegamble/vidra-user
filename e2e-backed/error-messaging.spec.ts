import { expect, test } from "@playwright/test";

import { registerUser } from "./fixtures";

// Friendly, ACCURATE error messaging proven against a real vidra-core + PostgreSQL.
//
// The mocked e2e suite (e2e/auth.spec.ts) fakes the backend's 409 conflict and
// asserts the copy; this backed spec proves the SAME copy fires against the real
// backend's real conflict response (the account genuinely already exists in the
// database), so the mapping can never drift from the live contract.

test("a duplicate signup shows the friendly taken message from the real backend", async ({
  page,
  request,
}) => {
  // Seed a real account directly via the API — this row now lives in PostgreSQL.
  const seeded = await registerUser(request, "dup");

  // Attempt to sign up again through the UI with the SAME username + a fresh
  // email → the backend answers 409 conflict (username already taken).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(seeded.username);
  await page.getByLabel("Email").fill(`e2e-dup-other-${seeded.id.slice(0, 8)}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();

  // Friendly copy — not a raw "conflict" code, not the terse backend string.
  await expect(page.getByText("That username or email is already taken.")).toBeVisible();
  // No session was created.
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
});
