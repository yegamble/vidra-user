import { expect, test, type Page } from "@playwright/test";

import { totpCode, uniqueId } from "./fixtures";

// Backend-backed e2e: the FULL TOTP lifecycle against a real vidra-core +
// PostgreSQL with NO route mocks. Enrollment happens through the UI on
// /settings/security; the test then computes real RFC 6238 codes from the
// enrolled secret (totpCode in fixtures.ts — SHA1/6 digits/30s, the backend's
// parameters) to play the authenticator's role, proving:
//   1. enroll -> verify persists the MFA row (status card flips to On, 10 codes);
//   2. logout -> login now GATES on the challenge (credentials alone issue no
//      session) and a computed TOTP code completes it into a real cookie-mode
//      session that survives a hard reload;
//   3. a recovery code also completes the challenge and is CONSUMED — the
//      status card re-reads 9 remaining from the database afterwards.
// Each run uses unique credentials so it repeats without a DB reset.

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("dialog", { name: "Account menu" }).getByRole("button", { name: "Sign out", exact: true }).click();
  // Scope to the header banner: a signed-out page BODY may render its own
  // "Sign in" link, so the banner landmark keeps this to the single header control.
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
}

async function loginExpectingChallenge(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
  // The credentials alone must NOT have produced a session.
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
}

// The challenge's TOTP entry is the segmented OtpInput: a role=group named
// "Authentication code" wrapping six single-digit boxes (each also substring-
// named "Authentication code digit N"). Fill the boxes one digit at a time — the
// key path a real user takes — instead of a single getByLabel, which now matches
// the group plus all six boxes (7 elements → strict-mode violation).
async function fillAuthenticationCode(page: Page, code: string) {
  const boxes = page.getByRole("group", { name: "Authentication code" }).getByRole("textbox");
  const digits = code.trim().split("");
  for (let i = 0; i < digits.length; i++) {
    await boxes.nth(i).fill(digits[i]);
  }
}

// The recovery-code path is a distinct free-text field revealed by the
// challenge's "Use a recovery code instead" toggle (recovery codes are not six
// digits, so they never belong in the segmented input). Switch to it and submit.
async function completeChallengeWithRecoveryCode(page: Page, recoveryCode: string) {
  await page.getByRole("button", { name: "Use a recovery code instead" }).click();
  await page.getByLabel("Recovery code").fill(recoveryCode.trim());
  await page.getByRole("button", { name: "Verify code" }).click();
}

test("TOTP enroll -> logout -> login gated by a computed code; a recovery code is consumed", async ({
  page,
}) => {
  test.slow(); // several full auth round trips
  const id = uniqueId();
  const username = `mfa${id}`;
  const email = `e2e-mfa-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI (cookie-mode session).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Enroll on /settings/security (client-side nav via the header).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage security settings" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await expect(page.getByRole("img", { name: "Authenticator enrollment QR code" })).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
  expect(secret.length).toBeGreaterThanOrEqual(16);

  // Play the authenticator: verify the enrollment with a computed code.
  await page.getByLabel("Verification code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Verify code" }).click();

  // The 10 recovery codes are shown exactly once — capture them.
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  const recoveryCodes = await page
    .getByRole("list", { name: "Recovery codes" })
    .getByRole("listitem")
    .allTextContents();
  expect(recoveryCodes).toHaveLength(10);

  await page.getByRole("button", { name: "I saved my recovery codes" }).click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("10 recovery codes left.")).toBeVisible();

  // Logout, then login: the MFA gate must now stand between the password and
  // the session (this is the DB-effect proof that enrollment persisted).
  await signOut(page);
  await loginExpectingChallenge(page, email, password);

  await fillAuthenticationCode(page, totpCode(secret));
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Account menu" }).getByText(`@${username}`, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // The challenge issued a real cookie-mode session: a hard reload restores it.
  await page.reload();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Recovery-code path: it completes the challenge and is consumed (single-use).
  await signOut(page);
  await loginExpectingChallenge(page, email, password);
  await completeChallengeWithRecoveryCode(page, recoveryCodes[0]);
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // The consumed code is reflected in the persisted status (10 -> 9), read
  // fresh from the backend after a hard navigation (cookie-restored session).
  await page.goto("/settings/security");
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("9 recovery codes left.")).toBeVisible();

  // And a used recovery code must NOT work again.
  await signOut(page);
  await loginExpectingChallenge(page, email, password);
  await completeChallengeWithRecoveryCode(page, recoveryCodes[0]);
  await expect(page.getByText(/That code didn't work/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);
});
