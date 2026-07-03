import { expect, test, type Page } from "@playwright/test";

// Mocked coverage of the Bluesky (ATProto) connection settings surface. A real
// backend is NOT running in `npm run ci`; the persistence round-trip is proven
// (only when opted in) in e2e-backed/atproto.spec.ts against a live PDS-enabled
// vidra-core.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const ATPROTO = /\/api\/v1\/me\/atproto(\?|$)/;

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u-ada",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: true,
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

const linkedStatus = {
  handle: "alice.bsky.social",
  did: "did:plc:abc123",
  pds_url: "https://bsky.social",
  auto_post: true,
  created_at: new Date().toISOString(),
};

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

// Client-side navigation Home → Settings → Connected accounts keeps the
// in-memory session (a hard reload would land signed-out in the mocked env).
async function gotoConnections(page: Page) {
  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("link", { name: "Manage connected accounts" }).click();
  await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();
}

test("links a Bluesky account and shows the connected status", async ({ page }) => {
  await signIn(page);

  let putBody: unknown = null;
  await page.route(ATPROTO, (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({ status: 404, json: { error: "not_found", message: "not linked" } });
    }
    if (method === "PUT") {
      putBody = route.request().postDataJSON();
      return route.fulfill({ json: linkedStatus });
    }
    return route.continue();
  });

  await gotoConnections(page);

  // The section is labelled with the ATProto protocol badge.
  await expect(page.getByText("ATProto", { exact: true })).toBeVisible();

  // App-password guidance is visible and explicit that it's NOT the main password.
  await expect(page.getByText("not your main password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an app password" })).toBeVisible();

  // The auto-post toggle is present and defaults on.
  const autoPost = page.getByRole("switch", {
    name: "Automatically post new public videos to Bluesky",
  });
  await expect(autoPost).toBeVisible();
  await expect(autoPost).toBeChecked();

  await page.getByLabel("Bluesky handle").fill("alice.bsky.social");
  await page.getByLabel("App password").fill("abcd-abcd-abcd-abcd");

  const put = page.waitForResponse(
    (r) => ATPROTO.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: "Connect Bluesky" }).click();
  await put;

  expect(putBody).toEqual({
    handle: "alice.bsky.social",
    app_password: "abcd-abcd-abcd-abcd",
    auto_post: true,
  });

  // The linked status now shows.
  await expect(page.getByText("@alice.bsky.social")).toBeVisible();
  await expect(page.getByText("did:plc:abc123")).toBeVisible();
  await expect(page.getByText("No videos announced yet")).toBeVisible();
});

test("surfaces a bad-credential error honestly", async ({ page }) => {
  await signIn(page);

  await page.route(ATPROTO, (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({ status: 404, json: { error: "not_found", message: "not linked" } });
    }
    if (method === "PUT") {
      return route.fulfill({
        status: 422,
        json: {
          error: { code: "invalid_credentials", message: "Bluesky rejected the credentials." },
        },
      });
    }
    return route.continue();
  });

  await gotoConnections(page);

  await page.getByLabel("Bluesky handle").fill("alice.bsky.social");
  await page.getByLabel("App password").fill("wrong-pass-word-here");
  await page.getByRole("button", { name: "Connect Bluesky" }).click();

  // Scope to the form's alert (Next's route announcer is also role=alert).
  const form = page.getByRole("form", { name: "Connect a Bluesky account" });
  const alert = form.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Bluesky rejected the credentials.");
  await expect(alert).toContainText("app password");
  // The form is still there (not navigated away) so the user can retry.
  await expect(page.getByLabel("Bluesky handle")).toBeVisible();
});

test("toggles auto-posting on a linked account (re-auth via app password)", async ({ page }) => {
  await signIn(page);

  let putBody: unknown = null;
  await page.route(ATPROTO, (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({ json: { ...linkedStatus, auto_post: true } });
    }
    if (method === "PUT") {
      putBody = route.request().postDataJSON();
      return route.fulfill({ json: { ...linkedStatus, auto_post: false } });
    }
    return route.continue();
  });

  await gotoConnections(page);
  await expect(page.getByText("@alice.bsky.social")).toBeVisible();

  const autoPost = page.getByRole("switch", {
    name: "Automatically post new public videos to Bluesky",
  });
  await expect(autoPost).toBeChecked();

  // Flip it off → the re-auth confirm reveals.
  await autoPost.click();
  await expect(autoPost).not.toBeChecked();
  await expect(page.getByLabel("Confirm your app password to turn off auto-posting")).toBeVisible();

  await page.getByLabel("Confirm your app password to turn off auto-posting").fill("abcd-abcd-abcd-abcd");
  const put = page.waitForResponse(
    (r) => ATPROTO.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await put;

  expect(putBody).toEqual({
    handle: "alice.bsky.social",
    app_password: "abcd-abcd-abcd-abcd",
    auto_post: false,
  });

  // The saved state now reads Off and the confirm panel is gone.
  await expect(page.getByText("Off — nothing is posted automatically.")).toBeVisible();
  await expect(
    page.getByLabel("Confirm your app password to turn off auto-posting"),
  ).toHaveCount(0);
});

test("unlinks a connected Bluesky account", async ({ page }) => {
  await signIn(page);

  await page.route(ATPROTO, (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({ json: linkedStatus });
    }
    if (method === "DELETE") {
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  await gotoConnections(page);
  await expect(page.getByText("@alice.bsky.social")).toBeVisible();

  // Arm, then confirm the unlink.
  await page.getByRole("button", { name: "Unlink" }).click();
  await expect(page.getByText("Auto-posting stops immediately.")).toBeVisible();

  const del = page.waitForResponse(
    (r) => ATPROTO.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unlink" }).click();
  await del;

  // Back to the connect form.
  await expect(page.getByLabel("Bluesky handle")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Bluesky" })).toBeVisible();
});

test("shows an honest not-enabled state when the extension is disabled", async ({ page }) => {
  await signIn(page);

  await page.route(ATPROTO, (route) =>
    route.fulfill({
      status: 503,
      json: { error: "disabled", message: "atproto disabled" },
    }),
  );

  await gotoConnections(page);

  await expect(page.getByTestId("atproto-disabled")).toContainText(
    "cross-posting isn",
  );
  await expect(page.getByTestId("atproto-disabled")).toContainText("enabled on this instance");
  // No connect form is offered when the feature is off.
  await expect(page.getByLabel("Bluesky handle")).toHaveCount(0);
});
