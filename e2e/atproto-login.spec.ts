import { expect, test } from "@playwright/test";

// "Continue with Bluesky" — the ATProto identity-login flow, fully mocked (no
// backend). The button is gated on GET /instance atproto_login; submitting a
// handle POSTs /auth/atproto/start and hands the browser off (top-level) to the
// returned authorization_url. The backend callback later redirects back to the
// BARE return_to with ?oauth=1 (success) or ?oauth_error=<code> (failure) — the
// same landing the OIDC flow uses, so those markers are re-exercised here.

const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const REFRESH = /\/api\/v1\/auth\/refresh$/;
const ME = /\/api\/v1\/auth\/me$/;
const START = /\/api\/v1\/auth\/atproto\/start$/;
// Stand-in for the real (cross-origin) authorization-server URL; kept
// same-origin so the mocked suite can intercept the hand-off navigation.
const AUTHORIZE = /\/__mock_pds_authorize/;

const user = {
  id: "u1",
  username: "alice.bsky.social",
  email: "",
  role: "user",
  email_verified: true,
  display_name: "",
  bio: "",
  created_at: new Date().toISOString(),
};
const session = { token: "acc", token_type: "Bearer", expires_in: 900, user };

function instanceJson({ atproto = false }: { atproto?: boolean } = {}) {
  return {
    name: "Vidra",
    description: "",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: [],
    atproto_login: atproto,
    federation_enabled: false,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
  };
}

test("shows the Bluesky button and hands off to the authorization URL with a bare return_to", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson({ atproto: true }) }));

  let startBody: unknown;
  await page.route(START, async (route) => {
    startBody = route.request().postDataJSON();
    await route.fulfill({ json: { authorization_url: "/__mock_pds_authorize?client=vidra" } });
  });
  await page.route(AUTHORIZE, (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body>PDS authorize</body></html>" }),
  );

  await page.goto("/login");

  const trigger = page.getByRole("button", { name: "Continue with Bluesky" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const handle = page.getByLabel("Bluesky or ATProto handle");
  await expect(handle).toBeVisible();
  await handle.fill("alice.bsky.social");
  await page.getByRole("button", { name: "Continue" }).click();

  // Top-level navigation to the (mocked) authorization server.
  await expect(page).toHaveURL(AUTHORIZE);
  // The start request carries a BARE return_to — the backend appends ?oauth=1
  // on the callback, so the frontend must NOT embed it here.
  expect(startBody).toEqual({ handle: "alice.bsky.social", return_to: "/login" });
});

test("no Bluesky button when atproto_login is off", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson({ atproto: false }) }));
  await page.goto("/login");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Bluesky" })).toHaveCount(0);
});

test("the signup page offers the Bluesky button with its own bare return_to", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson({ atproto: true }) }));

  let startBody: unknown;
  await page.route(START, async (route) => {
    startBody = route.request().postDataJSON();
    await route.fulfill({ json: { authorization_url: "/__mock_pds_authorize" } });
  });
  await page.route(AUTHORIZE, (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body>PDS authorize</body></html>" }),
  );

  await page.goto("/signup");
  await page.getByRole("button", { name: "Continue with Bluesky" }).click();
  await page.getByLabel("Bluesky or ATProto handle").fill("bob.pds.example");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(AUTHORIZE);
  expect(startBody).toEqual({ handle: "bob.pds.example", return_to: "/signup" });
});

test("the ?oauth=1 success landing silent-refreshes into the session and leaves /login", async ({
  page,
}) => {
  // The ATProto callback set the httpOnly refresh cookie and appended ?oauth=1;
  // the boot silent-refresh turns it into a session (same landing as OIDC).
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson({ atproto: true }) }));
  await page.route(REFRESH, (route) => route.fulfill({ json: session }));
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.goto("/login?oauth=1");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
});

test("an atproto_identity_mismatch error landing shows honest copy and cleans the URL", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson({ atproto: true }) }));
  await page.goto("/login?oauth=1&oauth_error=atproto_identity_mismatch");

  await expect(page.getByText("Bluesky sign-in could not be verified. Try again.")).toBeVisible();
  // The one-shot markers must not survive into history/bookmarks.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
