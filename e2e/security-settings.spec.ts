import { expect, test, type Page } from "@playwright/test";

const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const MFA_STATUS = /\/api\/v1\/auth\/mfa$/;
const MFA_TOTP = /\/api\/v1\/auth\/mfa\/totp$/;
const MFA_VERIFY = /\/api\/v1\/auth\/mfa\/totp\/verify$/;
const IDENTITIES = /\/api\/v1\/me\/oauth-identities$/;

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

const RECOVERY_CODES = [
  "a1b2c-00001",
  "a1b2c-00002",
  "a1b2c-00003",
  "a1b2c-00004",
  "a1b2c-00005",
  "a1b2c-00006",
  "a1b2c-00007",
  "a1b2c-00008",
  "a1b2c-00009",
  "a1b2c-00010",
];

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(IDENTITIES, (route) => route.fulfill({ json: { identities: [] } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Reach /settings/security via client-side nav so the in-memory session survives.
// (The URL assertion matters: /settings also has a "Security" card heading, so a
// heading-only wait can pass before the navigation actually completes.)
async function openSecuritySettings(page: Page) {
  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("link", { name: "Manage security settings" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.getByRole("heading", { name: "Security", level: 1 })).toBeVisible();
}

test("the full enrollment happy path: QR + secret -> verify -> recovery codes shown once -> enabled", async ({
  page,
}) => {
  await signIn(page);
  // The status flips to enabled once the enrollment verifies.
  let enabled = false;
  await page.route(MFA_STATUS, (route) =>
    route.fulfill({
      json: { enabled, recovery_codes_remaining: enabled ? 10 : 0 },
    }),
  );
  await page.route(MFA_TOTP, (route) =>
    route.fulfill({
      json: {
        secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        otpauth_uri:
          "otpauth://totp/Vidra:ada@example.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Vidra",
      },
    }),
  );
  let verifyBody: unknown;
  await page.route(MFA_VERIFY, async (route) => {
    verifyBody = route.request().postDataJSON();
    enabled = true;
    await route.fulfill({ json: { recovery_codes: RECOVERY_CODES } });
  });

  await openSecuritySettings(page);
  await expect(page.getByText("Off", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();

  // The one-time secret is shown as BOTH a QR image and copyable text.
  await expect(page.getByRole("img", { name: "Authenticator enrollment QR code" })).toBeVisible();
  await expect(page.getByTestId("totp-secret")).toHaveText("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  await expect(page.getByRole("button", { name: "Copy secret" })).toBeVisible();

  await page.getByLabel("Verification code").fill("123456");
  await page.getByRole("button", { name: "Verify code" }).click();

  // The 10 recovery codes, shown exactly once, with save affordances.
  await expect(page.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
  const codeList = page.getByRole("list", { name: "Recovery codes" });
  await expect(codeList.getByRole("listitem")).toHaveCount(10);
  await expect(codeList.getByText("a1b2c-00001")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy recovery codes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download codes" })).toBeVisible();
  expect(verifyBody).toEqual({ code: "123456" });

  await page.getByRole("button", { name: "I saved my recovery codes" }).click();

  // Back on the status card: enabled, all codes intact, disable flow offered.
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("10 recovery codes left.")).toBeVisible();
  await expect(codeList).toHaveCount(0); // never shown again
  await expect(
    page.getByRole("button", { name: "Turn off two-factor authentication" }),
  ).toBeVisible();
});

test("a wrong enrollment code shows the honest 400 error and stays on the step", async ({
  page,
}) => {
  await signIn(page);
  await page.route(MFA_STATUS, (route) =>
    route.fulfill({ json: { enabled: false, recovery_codes_remaining: 0 } }),
  );
  await page.route(MFA_TOTP, (route) =>
    route.fulfill({ json: { secret: "JBSWY3DP", otpauth_uri: "otpauth://totp/x?secret=JBSWY3DP" } }),
  );
  await page.route(MFA_VERIFY, (route) =>
    route.fulfill({
      status: 400,
      json: { error: { code: "bad_request", message: "invalid code" } },
    }),
  );

  await openSecuritySettings(page);
  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByText(/That code didn't verify/)).toBeVisible();
  await expect(page.getByLabel("Verification code")).toBeVisible();
});

test("disabling requires the password and returns the card to Off", async ({ page }) => {
  await signIn(page);
  let enabled = true;
  await page.route(MFA_STATUS, (route) =>
    route.fulfill({ json: { enabled, recovery_codes_remaining: enabled ? 8 : 0 } }),
  );
  let disableBody: unknown;
  await page.route(MFA_TOTP, async (route) => {
    if (route.request().method() === "DELETE") {
      disableBody = route.request().postDataJSON();
      enabled = false;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fallback();
  });

  await openSecuritySettings(page);
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("8 recovery codes left.")).toBeVisible();

  await page.getByLabel("Current password").fill("supersecret");
  await page.getByRole("button", { name: "Turn off two-factor authentication" }).click();

  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  expect(disableBody).toEqual({ password: "supersecret" });
});

test("a wrong disable password surfaces the 403 without changing the status", async ({ page }) => {
  await signIn(page);
  await page.route(MFA_STATUS, (route) =>
    route.fulfill({ json: { enabled: true, recovery_codes_remaining: 8 } }),
  );
  await page.route(MFA_TOTP, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "forbidden", message: "incorrect password" } },
    }),
  );

  await openSecuritySettings(page);
  await page.getByLabel("Current password").fill("wrong");
  await page.getByRole("button", { name: "Turn off two-factor authentication" }).click();

  await expect(page.getByText("Incorrect password.")).toBeVisible();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
});

test("prompts to sign in when the session is gone", async ({ page }) => {
  // A hard load lands signed out (the session lives only in memory).
  await page.goto("/settings/security");
  await expect(page.getByText("Sign in to manage security settings")).toBeVisible();
});
