import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { API_URL, loginTokenByIdentifier } from "./fixtures";

// Backend-backed e2e: runs against a REAL vidra-core + PostgreSQL with NO route
// mocks (the `backend-backed` Playwright project). It proves the signup
// data-mutating flow actually persists: UI signup → the account is written to
// Postgres → a fresh UI login reads it back. The frontend must be built pointing
// at the running backend (NEXT_PUBLIC_API_BASE_URL) — see vidra-user/.ralph/AGENT.md.
//
// Each run uses a unique email so it is repeatable without resetting the DB.
test("signup persists the account and a fresh login reads it back", async ({ page }) => {
  // A per-test unique id avoids email/username collisions even when the
  // backend-backed specs run in parallel from the same machine.
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const username = `e2ea${id}`;
  const email = `e2e-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI against the real backend.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // The account is created and the visible menu trigger proves the session exists.
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Sign out, then sign back in with the same credentials. A successful fresh
  // login can only work if the account row persisted in the database.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("dialog", { name: "Account menu" }).getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);

  await page.goto("/login");
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
});

// The username half of the same proof. Only a real database can answer this:
// the account is found by lower(username) with no is_active filter, and the
// session it issues is the same one an email sign-in gets.
test("a persisted account signs in with its username", async ({ page, request }) => {
  const id = randomUUID().replace(/-/g, "").slice(0, 12);
  const username = `e2au${id}`;
  const email = `e2e-${id}@example.test`;
  const password = "supersecret-e2e";

  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username, email, password },
  });
  expect(reg.ok(), await reg.text()).toBe(true);

  // API level: the identifier field resolves the username to a real session.
  expect(await loginTokenByIdentifier(request, username, password)).not.toBe("");
  // Case-insensitively, like the email column.
  expect(await loginTokenByIdentifier(request, username.toUpperCase(), password)).not.toBe("");
  // And a wrong password on a username match is refused, not retried elsewhere.
  expect(await loginTokenByIdentifier(request, username, "not-the-password")).toBe("");

  // UI level: the same username through the sign-in form.
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Account menu" }).getByText(`@${username}`, { exact: true }),
  ).toBeVisible();
});
