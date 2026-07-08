import { expect, test, type Page } from "@playwright/test";

// Mocked embed-privacy + password enforcement on /embed (CORE-17 / W1.7). No
// backend runs in `npm run ci`; the real policy round trip is proven in
// e2e-backed/video-password.spec.ts. The embed page reads the policy first and
// enforces it client-side, then runs the same unlock flow as the watch page.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const EMBED_PRIVACY = /\/api\/v1\/videos\/v1\/embed-privacy$/;
const UNLOCK = /\/api\/v1\/videos\/v1\/unlock$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;

const TOKEN = "pt-ok";

const publicVideo = {
  id: "v1",
  channel_id: "c1",
  title: "Embeddable Clip",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 3,
  has_thumbnail: false,
};

async function mockOriginal(page: Page) {
  await page.route(ORIGINAL, (route) => route.abort()); // don't stream bytes
}

test("an embed-disabled video shows the disabled panel, not the player", async ({ page }) => {
  await page.route(EMBED_PRIVACY, (route) => route.fulfill({ json: { status: "disabled" } }));
  await page.route(DETAIL, (route) => route.fulfill({ json: publicVideo }));
  await mockOriginal(page);

  await page.goto("/embed/v1");

  await expect(page.getByText("Embedding is disabled for this video.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("a whitelisted video opened directly (top-level) is allowed to play", async ({ page }) => {
  // A direct top-level open of /embed is always permitted — only actual iframing
  // on a non-listed host is blocked (that branch is unit-tested in decideEmbed).
  await page.route(EMBED_PRIVACY, (route) =>
    route.fulfill({ json: { status: "whitelist", allowed_domains: ["example.com"] } }),
  );
  await page.route(DETAIL, (route) => route.fulfill({ json: publicVideo }));
  await mockOriginal(page);

  await page.goto("/embed/v1");

  await expect(page.getByRole("link", { name: "Embeddable Clip" })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
});

test("a password-protected embed prompts, then unlocks and plays with the token", async ({
  page,
}) => {
  await page.route(EMBED_PRIVACY, (route) => route.fulfill({ json: { status: "enabled" } }));
  await page.route(DETAIL, (route) => {
    const auth = route.request().headers()["authorization"] ?? "";
    if (auth.includes(`Bearer ${TOKEN}`)) {
      return route.fulfill({ json: { ...publicVideo, privacy: "password" } });
    }
    return route.fulfill({
      status: 401,
      json: { error: { code: "password_required", message: "locked" } },
    });
  });
  await page.route(UNLOCK, (route) =>
    route.fulfill({ json: { playback_token: TOKEN, expires_in: 21600 } }),
  );
  await mockOriginal(page);

  await page.goto("/embed/v1");

  await expect(page.getByText("This video is password protected")).toBeVisible();
  await page.getByLabel("Video password").fill("hunter2");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.locator("video")).toHaveCount(1);
  await expect(page.locator("video")).toHaveAttribute("src", /\/original\?pt=pt-ok$/);
});
