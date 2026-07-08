import { expect, test, type Page } from "@playwright/test";

const LOGIN = /\/api\/v1\/auth\/login$/;
const CHALLENGE = /\/api\/v1\/auth\/mfa\/challenge$/;
const FEED = /\/api\/v1\/videos(\?|$)/;

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: true,
  display_name: "",
  bio: "",
  created_at: new Date().toISOString(),
};
const session = { token: "acc", token_type: "Bearer", expires_in: 900, user };

// The two-factor screen enters a TOTP code across six single-digit boxes; fill
// them by their positional accessible name so the combined value builds up.
async function fillTotp(page: Page, code: string) {
  for (let i = 0; i < code.length; i++) {
    await page.getByLabel(`Authentication code digit ${i + 1}`, { exact: true }).fill(code[i]);
  }
}

async function loginToChallenge(page: Page) {
  await page.route(LOGIN, (route) =>
    route.fulfill({ json: { mfa_required: true, mfa_token: "mfa-tok-1" } }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
}

test("an MFA-enabled login swaps to the code entry — no session yet", async ({ page }) => {
  await loginToChallenge(page);

  // No session was issued by the credentials alone.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  // The six-digit box grid (a named group) is the default entry.
  await expect(page.getByRole("group", { name: "Authentication code" })).toBeVisible();
  await expect(page.getByText(/6-digit code from your authenticator app/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use a recovery code instead" })).toBeVisible();
  // The credential fields are gone while the challenge is active.
  await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("a TOTP code completes the challenge into a cookie-mode session", async ({ page }) => {
  await loginToChallenge(page);
  let body: unknown;
  await page.route(CHALLENGE, async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: session });
  });

  await fillTotp(page, "123456");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(body).toEqual({ mfa_token: "mfa-tok-1", code: "123456", cookie_mode: true });
});

test("a recovery code goes through the same challenge", async ({ page }) => {
  await loginToChallenge(page);
  let body: unknown;
  await page.route(CHALLENGE, async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: session });
  });

  // Recovery codes are hyphenated, not 6 digits: the "use a recovery code"
  // path swaps to a single free-text field.
  await page.getByRole("button", { name: "Use a recovery code instead" }).click();
  await page.getByLabel("Recovery code").fill("a1b2c-3d4e5");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(body).toEqual({ mfa_token: "mfa-tok-1", code: "a1b2c-3d4e5", cookie_mode: true });
});

test("a wrong or expired code is an honest 401, and the challenge stays", async ({ page }) => {
  await loginToChallenge(page);
  await page.route(CHALLENGE, (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "unauthorized", message: "invalid code or token" } },
    }),
  );

  await fillTotp(page, "000000");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByText(/That code didn't work, or this sign-in attempt has expired/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Authentication code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("rate limiting on the challenge is reported honestly", async ({ page }) => {
  await loginToChallenge(page);
  await page.route(CHALLENGE, (route) =>
    route.fulfill({
      status: 429,
      json: { error: { code: "rate_limited", message: "too many requests" } },
    }),
  );

  await fillTotp(page, "123456");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByText("Too many attempts — wait a moment and try again.")).toBeVisible();
});

test("back to sign in abandons the challenge and returns to credentials", async ({ page }) => {
  await loginToChallenge(page);

  await page.getByRole("button", { name: "Back to sign in" }).click();

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("group", { name: "Authentication code" })).toHaveCount(0);
});
