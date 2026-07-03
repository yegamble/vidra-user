import { expect, test } from "@playwright/test";

import { API_URL, TINY_PNG_BASE64, loginToken, uniqueId } from "./fixtures";

// Proves the avatar/banner round trip against a real vidra-core + PostgreSQL:
// a user uploads an account avatar in settings and it survives a FRESH reload
// (the preview is driven by has_avatar from GET /auth/me, not local state);
// then a creator sets a channel avatar + banner from the studio row editor and
// the PUBLIC channel page renders both. Persistence is read back via the API
// (has_avatar/has_banner flags + 200s from the public serve endpoints).
test("account and channel avatars persist and render after refetch", async ({ page, request }) => {
  const id = uniqueId();
  const username = `fan${id}`;
  const email = `e2e-ava-${id}@example.test`;
  const password = "supersecret-e2e";
  const handle = `ch${id}`;
  const png = (name: string) => ({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });

  // Sign up in the UI.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Settings → upload the account avatar (starts on the initial-letter fallback).
  await page.getByRole("link", { name: username }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  const avatarSection = page.getByRole("region", { name: "Avatar", exact: true });
  await expect(avatarSection.locator("img")).toHaveCount(0);
  const uploaded = page.waitForResponse(
    (r) => /\/api\/v1\/me\/avatar$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await avatarSection.getByLabel("Avatar image").setInputFiles(png("face.png"));
  await uploaded;
  await expect(avatarSection.getByRole("img", { name: "Current avatar" })).toBeVisible();

  // Persisted: a FRESH reload (session restored via the httpOnly refresh cookie,
  // user re-read from /auth/me) still shows the avatar in settings and the header.
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Avatar", exact: true }).getByRole("img", { name: "Current avatar" }),
  ).toBeVisible();
  await expect(page.getByRole("banner").locator('img[src*="/avatar"]')).toBeVisible();

  // DB evidence via the API: /auth/me carries has_avatar=true and the public
  // serve endpoint has the stored image.
  const token = await loginToken(request, email, password);
  const meRes = await request.get(`${API_URL}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = (await meRes.json()) as { id: string; has_avatar: boolean };
  expect(me.has_avatar).toBe(true);
  expect((await request.get(`${API_URL}/api/v1/users/${me.id}/avatar`)).status()).toBe(200);

  // Studio → create a channel and set its avatar + banner from the row editor.
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await created;

  await page.getByRole("button", { name: `Edit ${handle}` }).click();
  const chAvatarPosted = page.waitForResponse(
    (r) =>
      new RegExp(`/api/v1/channels/${handle}/avatar$`).test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Channel avatar image").setInputFiles(png("chface.png"));
  await chAvatarPosted;
  await expect(page.getByRole("img", { name: "Current channel avatar" })).toBeVisible();

  const chBannerPosted = page.waitForResponse(
    (r) =>
      new RegExp(`/api/v1/channels/${handle}/banner$`).test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Channel banner image").setInputFiles(png("chwide.png"));
  await chBannerPosted;
  await expect(page.getByRole("img", { name: "Current channel banner" })).toBeVisible();

  // Persisted: the PUBLIC channel page (a fresh route load, no studio state)
  // renders the channel avatar and the banner across the top.
  await page.goto(`/channels/${handle}`);
  await expect(page.getByRole("heading", { name: `Channel ${id}` })).toBeVisible();
  await expect(page.locator(`img[src*="/channels/${handle}/avatar"]`)).toBeVisible();
  await expect(page.locator(`img[src*="/channels/${handle}/banner"]`)).toBeVisible();

  // DB evidence via the API: the channel view carries both flags and both
  // public serve endpoints return the stored images.
  const ch = await request.get(`${API_URL}/api/v1/channels/${handle}`);
  expect(await ch.json()).toMatchObject({ has_avatar: true, has_banner: true });
  expect((await request.get(`${API_URL}/api/v1/channels/${handle}/avatar`)).status()).toBe(200);
  expect((await request.get(`${API_URL}/api/v1/channels/${handle}/banner`)).status()).toBe(200);
});
