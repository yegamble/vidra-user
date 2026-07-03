import { expect, test } from "@playwright/test";

import { muteInstance, mutedInstances, registerUser, uniqueId } from "./fixtures";

// Proves the instance-mute round trip against a real vidra-core + PostgreSQL.
// The UI "Mute instance" control lives on a remote video's watch page, which
// needs federated content the plain backed stack does not have (a compose-level
// fake-remote harness is a tracked follow-up; the backend's own httptest
// federation suite covers ingestion) — so the mute is seeded via the API as the
// user, and the UI proves: the persisted mute is listed on Settings → Mutes →
// Instances after a fresh authed read, unmuting from the UI persists (confirmed
// via a direct API read), and the empty state returns.
test("a seeded instance mute is listed and unmuting persists", async ({ page, request }) => {
  const user = await registerUser(request, "imute");
  const domain = `muted-${uniqueId()}.example`;
  const status = await muteInstance(request, user.token, domain);
  expect(status).toBe(204);

  // The mute persisted (DB-backed API read).
  expect((await mutedInstances(request, user.token)).map((i) => i.domain)).toContain(domain);

  // Sign in through the UI (the in-memory session needs a UI login).
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Settings → Mutes → Instances (client-side nav keeps the session). The row
  // is a fresh authed read of the persisted mute.
  await page.getByRole("link", { name: user.username }).click();
  await page.getByRole("link", { name: "Manage muted accounts" }).click();
  await page.getByRole("link", { name: "Instances" }).click();
  await expect(page.getByRole("heading", { name: "Muted instances" })).toBeVisible();
  await expect(page.getByText(domain)).toBeVisible();

  // Unmute from the UI → the row drops and the backend row is gone.
  const unmuted = page.waitForResponse(
    (r) =>
      /\/me\/mutes\/instances\/[^/]+$/.test(r.url()) &&
      r.request().method() === "DELETE" &&
      r.ok(),
  );
  await page.getByRole("button", { name: `Unmute ${domain}` }).click();
  await unmuted;
  await expect(page.getByText(domain)).toHaveCount(0);
  await expect(page.getByText("No muted instances")).toBeVisible();

  // Persistence of the unmute, confirmed by a direct API (database) read.
  expect((await mutedInstances(request, user.token)).map((i) => i.domain)).not.toContain(domain);
});
