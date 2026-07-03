import { expect, test, type Page } from "@playwright/test";

// Session persistence across hard reloads (cookie-mode refresh). The refresh
// token lives in an httpOnly cookie the JS never sees; these mocked tests
// simulate the cookie with a `cookieSet` flag flipped by the login route —
// exactly the state the browser would hold — and assert the client-side
// behavior: silent boot refresh, quiet signed-out fallback, and the
// 401 → one silent refresh → retry path.

const REFRESH = /\/api\/v1\/auth\/refresh$/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const LOGOUT = /\/api\/v1\/auth\/logout$/;
const ME = /\/api\/v1\/auth\/me$/;
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

// Cookie-mode AuthResponse: the body carries NO refresh_token.
function session(token: string) {
  return { token, token_type: "Bearer", expires_in: 900, user };
}

function unauthorized(message = "unauthorized") {
  return { status: 401, json: { error: { code: "unauthorized", message } } };
}

async function mockFeed(page: Page) {
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
}

async function signInViaForm(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("a hard reload keeps you signed in via the cookie refresh", async ({ page }) => {
  let cookieSet = false;
  const refreshBodies: unknown[] = [];
  await page.route(REFRESH, async (route) => {
    refreshBodies.push(route.request().postDataJSON());
    if (cookieSet) await route.fulfill({ json: session("acc2") });
    else await route.fulfill(unauthorized("no session"));
  });
  await page.route(LOGIN, async (route) => {
    cookieSet = true; // the real backend sets the httpOnly cookie here
    await route.fulfill({ json: session("acc1") });
  });
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await mockFeed(page);

  await signInViaForm(page);

  await page.reload();

  // The boot-time silent refresh + /auth/me restore the session.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ada" })).toBeVisible();

  // The silent refresh never carries a body token — the cookie is the carrier.
  for (const body of refreshBodies) {
    expect(body).toEqual({ cookie_mode: true });
  }
});

test("a failed boot refresh lands signed out with no error UI", async ({ page }) => {
  await page.route(REFRESH, (route) => route.fulfill(unauthorized("no session")));
  await mockFeed(page);

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  // Quietly anonymous: no error surface anywhere (ErrorState never renders).
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
});

test("an expired access token triggers one silent refresh and a retry", async ({ page }) => {
  let cookieSet = false;
  let refreshesWhileSignedIn = 0;
  const patchAuths: Array<string | undefined> = [];

  await page.route(REFRESH, async (route) => {
    if (cookieSet) {
      refreshesWhileSignedIn += 1;
      await route.fulfill({ json: session("acc2") });
    } else {
      await route.fulfill(unauthorized("no session"));
    }
  });
  await page.route(LOGIN, async (route) => {
    cookieSet = true;
    await route.fulfill({ json: session("acc1") });
  });
  await page.route(ME, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fulfill({ json: user });
      return;
    }
    const auth = route.request().headers()["authorization"];
    patchAuths.push(auth);
    // The stale token is rejected once; the rotated token succeeds.
    if (auth === "Bearer acc2") {
      await route.fulfill({ json: { ...user, display_name: "Ada Lovelace" } });
    } else {
      await route.fulfill(unauthorized("token expired"));
    }
  });
  await mockFeed(page);

  await signInViaForm(page);

  // Client-side nav to settings; save a profile edit — the PATCH 401s with the
  // "expired" acc1 token, silently refreshes, and retries with acc2.
  await page.getByRole("link", { name: "ada" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Profile saved.")).toBeVisible();
  // Still signed in, exactly one silent refresh, retried once with the new token.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(refreshesWhileSignedIn).toBe(1);
  expect(patchAuths).toEqual(["Bearer acc1", "Bearer acc2"]);
});

test("a second 401 after the silent refresh signs you out", async ({ page }) => {
  let cookieSet = false;
  await page.route(REFRESH, async (route) => {
    if (cookieSet) await route.fulfill({ json: session("acc2") });
    else await route.fulfill(unauthorized("no session"));
  });
  await page.route(LOGIN, async (route) => {
    cookieSet = true;
    await route.fulfill({ json: session("acc1") });
  });
  await page.route(ME, async (route) => {
    // Every PATCH is unauthorized — even after the refresh rotates the token.
    if (route.request().method() === "PATCH") await route.fulfill(unauthorized("revoked"));
    else await route.fulfill({ json: user });
  });
  await mockFeed(page);

  await signInViaForm(page);

  await page.getByRole("link", { name: "ada" }).click();
  await page.getByLabel("Display name").fill("Ada Lovelace");
  await page.getByRole("button", { name: "Save" }).click();

  // The session is dropped everywhere: header shows Sign in, settings shows
  // the signed-out prompt instead of the form.
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Sign in to manage your account")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("signing out clears the cookie session (empty-body logout with credentials)", async ({
  page,
}) => {
  let cookieSet = false;
  let logoutBody: unknown;
  await page.route(REFRESH, async (route) => {
    if (cookieSet) await route.fulfill({ json: session("acc2") });
    else await route.fulfill(unauthorized("no session"));
  });
  await page.route(LOGIN, async (route) => {
    cookieSet = true;
    await route.fulfill({ json: session("acc1") });
  });
  await page.route(LOGOUT, async (route) => {
    logoutBody = route.request().postDataJSON();
    cookieSet = false; // the real backend clears the cookie (Max-Age=0)
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route(ME, (route) => route.fulfill({ json: user }));
  await mockFeed(page);

  await signInViaForm(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  // The logout body carries no token — the httpOnly cookie identifies the session.
  expect(logoutBody).toEqual({});

  // A reload stays signed out: the refresh cookie is gone.
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});
