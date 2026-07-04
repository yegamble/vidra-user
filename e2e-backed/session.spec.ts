import { expect, test } from "@playwright/test";

import { uniqueId } from "./fixtures";

// Backend-backed e2e: runs against a REAL vidra-core + PostgreSQL with NO route
// mocks (the `backend-backed` Playwright project). It proves cookie-mode session
// persistence end to end: signup opts into cookie mode (httpOnly `vidra_refresh`
// cookie), a HARD RELOAD rehydrates the session via the silent POST /auth/refresh
// (rotating the server-side refresh token row), and sign-out revokes the session
// and clears the cookie so a further reload stays signed out. The backed stack
// must allow credentialed CORS from the app origin (Access-Control-Allow-
// Credentials) — the backend slice ships that.
//
// Each run uses a unique email/username so it is repeatable without a DB reset.
test("session survives a hard reload and sign-out sticks across reloads", async ({ page }) => {
  const id = uniqueId();
  const username = `sess${id}`;
  const email = `e2e-sess-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI against the real backend (cookie-mode session).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // HARD RELOAD: the in-memory access token is gone; the boot-time silent
  // refresh must rehydrate the session from the httpOnly cookie — which only
  // works if the backend persisted the refresh session and honors rotation.
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: username })).toBeVisible();

  // And again — rotation must have replaced the cookie with a live token, not
  // consumed it (a reused/rotated token would 401 and sign us out).
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Sign out: the backend revokes the session and clears the cookie. Assert the
  // header's own "Sign in" (scoped to the banner landmark): logout does not
  // navigate, so depending on how far the post-signup client nav had committed we
  // may land on a page whose BODY also offers a "Sign in" link (e.g. the signup
  // form's "Already have an account? Sign in") — the banner scope keeps this an
  // unambiguous, single-element assertion of the signed-out header.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  // A reload stays signed out: no cookie, no session — the boot refresh lands
  // quietly anonymous (this is the DB-effect proof that logout revoked the
  // refresh session server-side, not just cleared local state).
  await page.reload();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
