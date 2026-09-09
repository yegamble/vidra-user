import { expect, test, type Page } from "@playwright/test";

const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
const IDENTITIES = /\/api\/v1\/me\/oauth-identities$/;
const CHALLENGE = /\/api\/v1\/auth\/mfa\/challenge$/;

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

  // The copy now carries the REMEDY, because the person reading it is usually
  // the legitimate owner of both: a provider's word about an address no longer
  // links anything, so the way in is the account's own credential plus a
  // deliberate connection from settings.
  await expect(
    page.getByText(/An account here already uses that email address/),
  ).toBeVisible();
  await expect(page.getByText(/connect this provider from Settings/)).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Account menu" }).getByText("@ada", { exact: true }),
  ).toBeVisible();
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

// The refusal that replaces the silent account switch A05 measured. It lands on
// the LOGIN page, so it has to be rendered there — a refusal the landing page
// cannot show is the one thing worse than the switch it prevents.
test("a refused account switch says which door is the right one", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.goto("/login?oauth=1&oauth_error=identity_belongs_to_another_account");

  await expect(
    page.getByText(/belongs to a different account here\. Sign out first/),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

// A provider sign-in that resolved to an account with two-factor on issues NO
// session: the callback parks the mfa_token in an httpOnly cookie and lands
// here with the FLAG ?mfa=required. The page shows the same challenge the
// password path uses, and the request that finishes it carries NO token —
// deliberately, so the whole first factor never appears in a URL, a history
// entry, a Referer header or a proxy log.
test("a provider sign-in with two-factor lands on the challenge and finishes without a token", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(["google"]) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  let body: Record<string, unknown> = {};
  await page.route(CHALLENGE, async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: session });
  });

  await page.goto("/login?mfa=required");

  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
  // No credentials form: this sign-in is already half-completed.
  await expect(page.getByLabel("Email")).toHaveCount(0);
  // The one-shot marker never survives into history or a bookmark.
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("button", { name: "Use a recovery code instead" }).click();
  await page.getByLabel("Recovery code").fill("a1b2c-3d4e5");
  await page.getByRole("button", { name: "Verify code" }).click();

  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  expect(body.mfa_token).toBeUndefined();
  expect(body.code).toBe("a1b2c-3d4e5");
  expect(body.cookie_mode).toBe(true);
});

// --- Connected logins on /settings -----------------------------------------

// providers is what the INSTANCE offers, which the settings section now needs
// as well as the identity list: a provider with no identity is a Connect row,
// and there is no other way to acquire one since an email match stopped
// linking.
async function signIn(page: Page, providers: string[] = ["google"]) {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(providers) }));
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
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

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connected logins" })).toBeVisible();
  await expect(page.getByText("Google")).toBeVisible();
  await expect(page.getByText("Github")).toBeVisible();
  await expect(page.getByText("ada@gmail.test", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Unlink Google" }).click();
  // The ROW stays and flips to a Connect control: Google is a provider this
  // instance offers, and a disconnection the person can no longer undo would be
  // a one-way door — connecting from here is the only linking path there is.
  await expect(page.getByRole("button", { name: "Connect Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlink Google" })).toHaveCount(0);
  await expect(page.getByText("ada@gmail.test", { exact: false })).toHaveCount(0);
  // Github is NOT offered by this instance, but the account has an identity for
  // it, so it stays listed and stays unlinkable.
  await expect(page.getByRole("button", { name: "Unlink Github" })).toBeVisible();
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

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Unlink Google" }).click();

  await expect(page.getByText(/only way to sign in.*Set a password first/)).toBeVisible();
  await expect(page.getByText("Google")).toBeVisible(); // the row stays
});

test("an unlinked provider the instance offers gets a Connect control", async ({ page }) => {
  await signIn(page);
  await page.route(IDENTITIES, (route) => route.fulfill({ json: { identities: [] } }));

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();

  // Connecting a provider is now a deliberate act performed HERE, because an
  // id_token whose email matches an existing account is refused rather than
  // linked. A configured provider with no identity is exactly that row.
  await expect(page.getByRole("button", { name: "Connect Google" })).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlink Google" })).toHaveCount(0);
});

test("an instance offering no providers says so", async ({ page }) => {
  await signIn(page, []);
  await page.route(IDENTITIES, (route) => route.fulfill({ json: { identities: [] } }));

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("This instance does not offer any external sign-in providers."),
  ).toBeVisible();
});
