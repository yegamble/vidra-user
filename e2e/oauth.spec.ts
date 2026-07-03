import { expect, test, type Page } from "@playwright/test";

const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
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

function instanceJson(providers: string[]) {
  return {
    name: "Vidra",
    description: "",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: providers,
    federation_enabled: false,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
  };
}

test("the login page renders one continue-with button per configured provider", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) =>
    route.fulfill({ json: instanceJson(["google", "github"]) }),
  );
  await page.goto("/login");

  const google = page.getByRole("link", { name: "Continue with Google" });
  const github = page.getByRole("link", { name: "Continue with Github" });
  await expect(google).toBeVisible();
  await expect(github).toBeVisible();
  // A top-level navigation to the backend's begin endpoint, carrying the
  // landing marker so the redirect back is recognised.
  await expect(google).toHaveAttribute(
    "href",
    /\/api\/v1\/auth\/oauth\/google\?return_to=%2Flogin%3Foauth%3D1$/,
  );
  await expect(github).toHaveAttribute("href", /\/api\/v1\/auth\/oauth\/github\?return_to=/);
});

test("the signup page renders the provider buttons with its own return path", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.goto("/signup");

  const google = page.getByRole("link", { name: "Continue with Google" });
  await expect(google).toBeVisible();
  await expect(google).toHaveAttribute(
    "href",
    /\/api\/v1\/auth\/oauth\/google\?return_to=%2Fsignup%3Foauth%3D1$/,
  );
});

test("no configured provider hides the OAuth section entirely", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson([]) }));
  await page.goto("/login");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Continue with/ })).toHaveCount(0);
  await expect(page.getByText("or", { exact: true })).toHaveCount(0);
});

test("an oauth_error landing shows honest copy and cleans the URL", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.goto("/login?oauth=1&oauth_error=access_denied");

  await expect(page.getByText("The sign-in was cancelled at the provider.")).toBeVisible();
  // The one-shot markers must not survive into history/bookmarks.
  await expect(page).toHaveURL(/\/login$/);
  // The password form stays usable.
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("an email_conflict landing on the signup page explains the conflict", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.goto("/signup?oauth=1&oauth_error=email_conflict");

  await expect(page.getByText(/another account already uses its email/)).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test("a cookie-mode OAuth success landing silent-refreshes into the session and leaves /login", async ({
  page,
}) => {
  // The callback set the httpOnly refresh cookie server-side; the landing's
  // boot silent-refresh turns it into a session.
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.route(REFRESH, (route) => route.fulfill({ json: session }));
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.goto("/login?oauth=1");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ada" })).toBeVisible();
});

test("a failed OAuth landing (no session cookie) falls back to the form with an error", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.route(REFRESH, (route) =>
    route.fulfill({ status: 401, json: { error: { code: "unauthorized", message: "no" } } }),
  );

  await page.goto("/login?oauth=1");

  await expect(
    page.getByText("Could not complete the sign-in with the provider. Please try again."),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

// --- Connected logins on /settings -----------------------------------------

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("settings lists the linked identities and unlink removes a row", async ({ page }) => {
  await signIn(page);
  let deleted = false;
  await page.route(IDENTITIES, (route) =>
    route.fulfill({
      json: {
        identities: [
          { provider: "google", email: "ada@gmail.test", created_at: "2026-01-05T00:00:00Z" },
          { provider: "github", email: "", created_at: "2026-02-01T00:00:00Z" },
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/me\/oauth-identities\/google$/, async (route) => {
    deleted = route.request().method() === "DELETE";
    await route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByRole("heading", { name: "Connected logins" })).toBeVisible();
  await expect(page.getByText("Google")).toBeVisible();
  await expect(page.getByText("Github")).toBeVisible();
  await expect(page.getByText("ada@gmail.test", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Unlink Google" }).click();
  await expect(page.getByText("Google")).toHaveCount(0);
  await expect(page.getByText("Github")).toBeVisible();
  expect(deleted).toBe(true);
});

test("unlinking the last sign-in method surfaces the 422 with the remedy", async ({ page }) => {
  await signIn(page);
  await page.route(IDENTITIES, (route) =>
    route.fulfill({
      json: {
        identities: [
          { provider: "google", email: "ada@gmail.test", created_at: "2026-01-05T00:00:00Z" },
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/me\/oauth-identities\/google$/, (route) =>
    route.fulfill({
      status: 422,
      json: {
        error: {
          code: "unprocessable_entity",
          message: "cannot remove the last sign-in method",
        },
      },
    }),
  );

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("button", { name: "Unlink Google" }).click();

  await expect(page.getByText(/only way to sign in.*Set a password first/)).toBeVisible();
  await expect(page.getByText("Google")).toBeVisible(); // the row stays
});

test("an account with no linked identities shows the empty copy", async ({ page }) => {
  await signIn(page);
  await page.route(IDENTITIES, (route) => route.fulfill({ json: { identities: [] } }));

  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByText("No external logins are linked to this account.")).toBeVisible();
});
