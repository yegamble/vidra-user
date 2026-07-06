import { expect, test } from "@playwright/test";

import { API_URL, TINY_PNG_BASE64, uniqueId } from "./fixtures";

// Regression lock for the channel-banner flow a demo build flagged as 404ing.
// The current code works; this proves the whole round trip against a real
// vidra-core + PostgreSQL so it can't silently regress:
//   1. a creator uploads a channel banner from the studio row editor,
//   2. the PUBLIC channel page renders it (the <img> stays mounted — it unmounts
//      on a load error, so a visible banner proves the serve endpoint did NOT 404),
//   3. the API confirms persistence: the channel view carries has_banner=true and
//      GET /channels/:handle/banner returns 200 with an image content-type.
//
// The banner is deliberately isolated from avatar.spec.ts (which bundles avatar +
// banner) so a banner-only 404 regression fails THIS named spec loudly.
test("a channel banner uploaded in the studio renders on the public channel page (no 404)", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const username = `crt${id}`;
  const email = `e2e-banner-${id}@example.test`;
  const password = "supersecret-e2e";
  const handle = `ch${id}`;
  const png = {
    name: "wide.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  };

  // Sign up in the UI (the session lives in memory).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Studio → create a channel, then open its row editor.
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await created;

  // Upload the banner from the studio row editor.
  await page.getByRole("button", { name: `Edit ${handle}` }).click();
  const bannerPosted = page.waitForResponse(
    (r) =>
      new RegExp(`/api/v1/channels/${handle}/banner$`).test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Channel banner image").setInputFiles(png);
  await bannerPosted;
  await expect(page.getByRole("img", { name: "Current channel banner" })).toBeVisible();

  // Persisted: the PUBLIC channel page (a fresh route load, no studio state)
  // renders the banner across the top. The banner <img> unmounts on a load error,
  // so its visibility proves the serve endpoint returned the stored image (no 404).
  await page.goto(`/channels/${handle}`);
  await expect(page.getByRole("heading", { name: `Channel ${id}` })).toBeVisible();
  await expect(page.locator(`img[src*="/channels/${handle}/banner"]`)).toBeVisible();

  // DB evidence via the API: the channel view carries has_banner=true and the
  // public serve endpoint returns 200 with an image content-type (not a 404).
  const ch = await request.get(`${API_URL}/api/v1/channels/${handle}`);
  expect(await ch.json()).toMatchObject({ has_banner: true });
  const banner = await request.get(`${API_URL}/api/v1/channels/${handle}/banner`);
  expect(banner.status()).toBe(200);
  expect(banner.headers()["content-type"]).toContain("image/");
});
