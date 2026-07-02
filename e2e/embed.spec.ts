import { expect, test } from "@playwright/test";

// Mocked embed-player coverage (a real backend is not running in `npm run ci`;
// the read contract is proven against a real published video in
// e2e-backed/embed.spec.ts).
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;

const detail = {
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

test("the embed player shows the video with no app chrome", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort()); // don't actually stream bytes

  await page.goto("/embed/v1");

  // The native <video> is present and points at the original-stream endpoint.
  const video = page.locator("video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("src", /\/api\/v1\/videos\/v1\/original$/);

  // The title links back to the full watch page (new tab).
  const title = page.getByRole("link", { name: "Embeddable Clip" });
  await expect(title).toBeVisible();
  await expect(title).toHaveAttribute("href", "/videos/v1");
  await expect(title).toHaveAttribute("target", "_blank");

  // No app chrome: the site header/nav is hidden on /embed.
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Vidra" })).toHaveCount(0);
});

test("the embed player reports an unavailable video", async ({ page }) => {
  await page.route(DETAIL, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "video not found" } } }),
  );
  await page.goto("/embed/v1");
  await expect(page.getByText("This video is not available.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
