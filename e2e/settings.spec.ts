import { expect, test, type Page } from "@playwright/test";

const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const ME = /\/api\/v1\/auth\/me$/;

const user = {
  id: "u1",
  username: "ada",
  email: "ada@example.test",
  role: "user",
  email_verified: false,
  display_name: "",
  bio: "",
  created_at: new Date().toISOString(),
};
const session = { token: "acc", refresh_token: "ref", token_type: "Bearer", expires_in: 900, user };

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
}

test("editing the profile shows a saved confirmation", async ({ page }) => {
  await signIn(page);
  await page.route(ME, (route) =>
    route.fulfill({ json: { ...user, display_name: "Ada Lovelace" } }),
  );

  // Reach settings via the header (client-side nav preserves the in-memory session).
  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();

  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Profile saved.")).toBeVisible();
});

test("an unverified user can resend the verification email from settings", async ({ page }) => {
  await signIn(page); // the mocked session user has email_verified: false
  let verifyCalled = false;
  await page.route(/\/api\/v1\/auth\/verify-email$/, async (route) => {
    verifyCalled = true;
    await route.fulfill({ status: 202, body: "" });
  });

  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();

  await page.getByRole("button", { name: "Resend verification email" }).click();
  await expect(page.getByText("Verification email sent. Check your inbox.")).toBeVisible();
  expect(verifyCalled).toBe(true);
});

test("maps a 422 field error inline", async ({ page }) => {
  await signIn(page);
  await page.route(ME, (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: "unprocessable_entity",
          message: "validation failed",
          fields: [{ field: "display_name", message: "must be at most 50 characters" }],
        },
      },
    }),
  );

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByLabel("Display name").fill("way too long");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("must be at most 50 characters")).toBeVisible();
});

test("the discovery opt-out toggle rides along with the profile save", async ({ page }) => {
  await signIn(page);
  let patchBody: unknown;
  await page.route(ME, (route) => {
    patchBody = route.request().postDataJSON();
    return route.fulfill({ json: { ...user, unlisted: true } });
  });

  await page.getByRole("link", { name: "ada" }).click();
  const toggle = page.getByLabel("Hide my account from discovery");
  await expect(toggle).not.toBeChecked(); // default false
  await toggle.check();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(patchBody).toMatchObject({ unlisted: true });
});

test("prompts to sign in when the session is gone", async ({ page }) => {
  // A hard load lands signed out (the session lives only in memory).
  await page.goto("/settings");
  await expect(page.getByText("Sign in to manage your account")).toBeVisible();
});

const DEACTIVATE = /\/api\/v1\/auth\/me\/deactivate$/;

test("deactivating the account signs the user out", async ({ page }) => {
  await signIn(page);
  await page.route(DEACTIVATE, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByLabel("Current password").fill("supersecret");
  await page.getByRole("button", { name: "Deactivate account" }).click();

  // Signed out: the header shows "Sign in" (scoped to the banner — a transient
  // signed-out prompt in the page body during the redirect would otherwise make
  // an unscoped "Sign in" match two elements and trip strict mode).
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
});

test("shows an error when the deactivate password is wrong", async ({ page }) => {
  await signIn(page);
  await page.route(DEACTIVATE, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "forbidden", message: "incorrect password" } },
    }),
  );

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByLabel("Current password").fill("nope");
  await page.getByRole("button", { name: "Deactivate account" }).click();

  await expect(page.getByText("Incorrect password.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

test("permanently deleting the account takes the two-step confirm and shows a goodbye state", async ({
  page,
}) => {
  await signIn(page);
  let deleteBody: unknown;
  let deleteMethod = "";
  await page.route(ME, (route) => {
    deleteMethod = route.request().method();
    deleteBody = route.request().postDataJSON();
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("link", { name: "ada" }).click();

  // Step 1: arm. No password/username fields are shown yet.
  await expect(page.getByLabel("Confirm your username")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete account permanently" }).click();

  // Step 2: password + type-the-username. The submit stays disabled until the
  // typed username matches exactly.
  const submit = page.getByRole("button", { name: "Permanently delete my account" });
  await page.getByLabel("Password", { exact: true }).fill("supersecret");
  await page.getByLabel("Confirm your username").fill("wrong-name");
  await expect(submit).toBeDisabled();
  await page.getByLabel("Confirm your username").fill("ada");
  await expect(submit).toBeEnabled();
  await submit.click();

  // Goodbye state + signed out (the session is gone).
  await expect(page.getByText("Your account has been deleted")).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  expect(deleteMethod).toBe("DELETE");
  expect(deleteBody).toEqual({ password: "supersecret" });
});

test("a wrong password on permanent delete is surfaced and nothing is deleted", async ({ page }) => {
  await signIn(page);
  await page.route(ME, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "forbidden", message: "incorrect password" } },
    }),
  );

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("button", { name: "Delete account permanently" }).click();
  await page.getByLabel("Password", { exact: true }).fill("nope");
  await page.getByLabel("Confirm your username").fill("ada");
  await page.getByRole("button", { name: "Permanently delete my account" }).click();

  await expect(page.getByText("Incorrect password.")).toBeVisible();
  // Still signed in, still on the confirm step — no goodbye state.
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(page.getByText("Your account has been deleted")).toHaveCount(0);
});
