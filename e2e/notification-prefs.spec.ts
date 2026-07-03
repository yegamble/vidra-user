import { expect, test, type Page } from "@playwright/test";

// Mocked notification-preferences coverage (a real backend is not running in
// `npm run ci`; the persistence round-trip is proven in
// e2e-backed/notification-prefs.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const PREFS = /\/api\/v1\/me\/notification-prefs$/;

const ALL_ON = {
  comment: true,
  follow: true,
  message: true,
  report_resolved: true,
  video_rejected: true,
};

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
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Reach the prefs page via settings (client-side nav keeps the in-memory session).
async function openPrefs(page: Page) {
  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("link", { name: "Manage notification preferences" }).click();
  await expect(
    page.getByRole("heading", { name: "Notification preferences" }),
  ).toBeVisible();
}

test("the prefs page prompts anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/settings/notifications");
  await expect(page.getByText("Sign in to manage notifications")).toBeVisible();
});

test("every known type renders as a switch and a toggle PATCHes just that type", async ({
  page,
}) => {
  await signIn(page);
  let patchBody: unknown;
  await page.route(PREFS, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { prefs: { ...ALL_ON, follow: false } } });
    }
    return route.fulfill({ json: { prefs: ALL_ON } });
  });

  await openPrefs(page);

  // All five known types render, on by default.
  for (const name of [
    "Comments notifications",
    "New followers notifications",
    "Direct messages notifications",
    "Report outcomes notifications",
    "Rejected uploads notifications",
  ]) {
    await expect(page.getByRole("switch", { name })).toBeVisible();
  }
  const follow = page.getByRole("switch", { name: "New followers notifications" });
  await expect(follow).toHaveAttribute("aria-checked", "true");

  const patched = page.waitForResponse(
    (r) => PREFS.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await follow.click();
  await patched;

  await expect(follow).toHaveAttribute("aria-checked", "false");
  expect(patchBody).toEqual({ prefs: { follow: false } });
  // The other switches are untouched.
  await expect(
    page.getByRole("switch", { name: "Direct messages notifications" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("a failed save reverts the switch and says so", async ({ page }) => {
  await signIn(page);
  await page.route(PREFS, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 500,
        json: { error: { code: "internal", message: "boom" } },
      });
    }
    return route.fulfill({ json: { prefs: ALL_ON } });
  });

  await openPrefs(page);
  const follow = page.getByRole("switch", { name: "New followers notifications" });
  await follow.click();

  await expect(page.getByText("Could not save that preference.", { exact: false })).toBeVisible();
  await expect(follow).toHaveAttribute("aria-checked", "true"); // reverted
});
