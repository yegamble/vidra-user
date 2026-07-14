import { expect, test, type Page } from "@playwright/test";

// Mocked instance-mute management coverage: the Instances tab under
// Settings → Mutes lists muted instances and unmutes them. The persistence
// round trip runs against a real backend in e2e-backed/instance-mutes.spec.ts.
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const MUTES_LIST = /\/api\/v1\/me\/mutes\/instances(\?|$)/;
const MUTE_ONE = /\/api\/v1\/me\/mutes\/instances\/[^/]+$/;
const ACCOUNT_MUTES = /\/api\/v1\/me\/mutes\/accounts(\?|$)/;

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "",
    bio: "",
    created_at: new Date().toISOString(),
  },
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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

test("anonymous viewers are prompted to sign in", async ({ page }) => {
  await page.goto("/settings/mutes/instances");
  await expect(page.getByText("Sign in to manage muted instances")).toBeVisible();
});

test("the Instances tab lists muted instances and unmutes them", async ({ page }) => {
  await signIn(page);

  await page.route(ACCOUNT_MUTES, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { accounts: [], limit: 100, offset: 0 } })
      : route.continue(),
  );
  await page.route(MUTES_LIST, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            instances: [{ domain: "videos.example", muted_at: new Date().toISOString() }],
            limit: 100,
            offset: 0,
          },
        })
      : route.continue(),
  );
  await page.route(MUTE_ONE, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 204, body: "" })
      : route.continue(),
  );

  // Settings → Mutes → Instances tab (client-side nav keeps the session).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage muted accounts" }).click();
  await expect(page.getByText("No muted accounts")).toBeVisible();
  await page.getByRole("link", { name: "Instances" }).click();
  await expect(page.getByRole("heading", { name: "Muted instances" })).toBeVisible();
  await expect(page.getByText("videos.example")).toBeVisible();

  const unmuted = page.waitForResponse(
    (r) => MUTE_ONE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unmute videos.example" }).click();
  await unmuted;

  await expect(page.getByText("videos.example")).toHaveCount(0);
  await expect(page.getByText("No muted instances")).toBeVisible();
});
