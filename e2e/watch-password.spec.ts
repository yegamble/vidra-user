import { expect, test, type Page } from "@playwright/test";

// Mocked password-protected watch flow (CORE-17 / W1.7). No backend runs in
// `npm run ci`; the real unlock→play round trip against a seeded password video
// is proven in e2e-backed/video-password.spec.ts. The detail endpoint answers
// 401 password_required until the request carries the minted playback token as a
// Bearer header (what api.getVideo attaches), at which point it returns 200.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const UNLOCK = /\/api\/v1\/videos\/v1\/unlock$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

const TOKEN = "pt-ok";

const unlockedVideo = {
  id: "v1",
  channel_id: "c1",
  title: "Secret Talk",
  description: "",
  privacy: "password",
  state: "published",
  created_at: new Date().toISOString(),
  views: 3,
  has_thumbnail: false,
  channel_handle: "h-c1",
  channel_display_name: "Channel c1",
};

// The detail is gated: 401 password_required until the Bearer playback token is
// presented, then 200. Side endpoints are mocked so only the unlock flow is under
// test.
async function mockLockedWatch(page: Page) {
  await page.route(DETAIL, (route) => {
    const auth = route.request().headers()["authorization"] ?? "";
    if (auth.includes(`Bearer ${TOKEN}`)) {
      return route.fulfill({ json: unlockedVideo });
    }
    return route.fulfill({
      status: 401,
      json: {
        error: { code: "password_required", message: "This video is password protected." },
      },
    });
  });
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

test("a password-protected video shows the unlock prompt instead of the player", async ({
  page,
}) => {
  await mockLockedWatch(page);
  await page.goto("/videos/v1");

  await expect(page.getByText("This video is password protected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock" })).toBeVisible();
  // The player, title, and actions stay gated behind the prompt.
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Secret Talk" })).toHaveCount(0);
});

test("a wrong password shows an inline error and does not unlock", async ({ page }) => {
  await mockLockedWatch(page);
  await page.route(UNLOCK, (route) =>
    route.fulfill({ status: 401, json: { error: { code: "unauthorized", message: "no" } } }),
  );
  await page.goto("/videos/v1");

  await page.getByLabel("Video password").fill("wrong-guess");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText("That password is incorrect.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("the correct password unlocks the video and plays it with a token-scoped src", async ({
  page,
}) => {
  await mockLockedWatch(page);
  let unlockPassword: string | null = null;
  await page.route(UNLOCK, (route) => {
    unlockPassword = JSON.parse(route.request().postData() ?? "{}").password ?? null;
    return route.fulfill({ json: { playback_token: TOKEN, expires_in: 21600 } });
  });
  await page.goto("/videos/v1");

  await page.getByLabel("Video password").fill("hunter2");
  await page.getByRole("button", { name: "Unlock" }).click();

  // The detail refetch (with the Bearer token) returns 200 → the player renders.
  await expect(page.getByRole("heading", { name: "Secret Talk" })).toBeVisible();
  // Progressive/native playback carries the token as ?pt= (the header-less path).
  await expect(page.locator("video")).toHaveAttribute("src", /\/original\?pt=pt-ok$/);
  expect(unlockPassword).toBe("hunter2");
});

test("the rate-limit response (429) is surfaced honestly", async ({ page }) => {
  await mockLockedWatch(page);
  await page.route(UNLOCK, (route) =>
    route.fulfill({ status: 429, json: { error: { code: "rate_limited", message: "slow" } } }),
  );
  await page.goto("/videos/v1");

  await page.getByLabel("Video password").fill("hunter2");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText(/Too many attempts/)).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
