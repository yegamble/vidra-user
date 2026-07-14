import { expect, test } from "@playwright/test";

import { API_URL, channelDetail, loginStatus, loginToken, uniqueId } from "./fixtures";

// Backend-backed e2e (real vidra-core + Postgres, no mocks): proves the
// PERMANENT account delete persists. A fresh account signs up through the UI,
// gets a channel via the API, then hard-deletes itself through the settings
// danger zone (arm → password + type-the-username). Afterwards a login with
// the same credentials is refused AND the public channel is 404 — which can
// only happen if the DB row was anonymised and the owned content purged.
test("permanently deleting the account refuses future logins and 404s the channel", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const username = `e2edel${id}`;
  const email = `e2e-del-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI (fresh account, collision-free).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Give the account a channel via the API so the §1 content-deletion promise
  // ("content deleted") is provable after the fact.
  const token = await loginToken(request, email, password);
  const handle = `delch${id}`;
  await request.post(`${API_URL}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { handle, display_name: `Doomed channel ${id}` },
  });
  expect((await channelDetail(request, handle)).status).toBe(200);

  // Delete permanently through the settings danger zone: two steps.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await page.getByRole("button", { name: "Delete account permanently" }).click();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm your username").fill(username);
  await page.getByRole("button", { name: "Permanently delete my account" }).click();

  // The goodbye state renders and the session is gone.
  await expect(page.getByText("Your account has been deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);

  // Login is refused — the account row was anonymised (401 invalid credentials,
  // not the deactivated account's 403 "disabled").
  expect(await loginStatus(request, email, password)).toBe(401);

  // The owned channel was purged from the public API.
  expect((await channelDetail(request, handle)).status).toBe(404);
});
