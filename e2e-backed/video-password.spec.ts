import { expect, test } from "@playwright/test";

import { API_URL, TINY_MP4_BASE64, channelVideos, loginToken, uniqueId } from "./fixtures";

// Backend-backed proof for password-protected videos + embed privacy (CORE-17 /
// W1.7) against a real vidra-core + PostgreSQL. Runs under
// `--project=backend-backed` (npm run e2e:backed), never in `npm run ci`.
//
// Each test proves the SERVER state changed (a password row exists / the embed
// policy is stored, read back through the API) AND the UI honours it after a
// fresh navigation — not just optimistic client state.

async function signUpAndChannel(
  page: import("@playwright/test").Page,
  id: string,
  handle: string,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await created;
}

async function publishTinyVideo(
  page: import("@playwright/test").Page,
  title: string,
): Promise<void> {
  await page.getByLabel("Video title").fill(title);
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  const uploaded = page.waitForResponse(
    (r) => /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await uploaded;
}

test("a set password gates the watch page: prompt, wrong password rejected, right password plays", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-pw-${id}@example.test`;
  const account = "supersecret-e2e";
  const videoPassword = "watch-me-please";
  const title = `Locked clip ${id}`;

  await signUpAndChannel(page, id, handle, email, account);
  await publishTinyVideo(page, title);

  // Edit → set privacy=password → add a password → save.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit privacy").selectOption("password");

  const added = page.waitForResponse(
    (r) => /\/videos\/[^/]+\/passwords$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("New password").fill(videoPassword);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await added;

  const patched = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await patched;

  // DB proof: the owner's API read lists exactly one password row for the video,
  // and the video's privacy is now "password".
  const token = await loginToken(request, email, account);
  const mine = (await channelVideos(request, handle, token)).find((v) => v.title === title);
  expect(mine).toBeTruthy();
  expect(mine!.privacy).toBe("password");
  const pwRes = await request.get(`${API_URL}/api/v1/videos/${mine!.id}/passwords`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(pwRes.ok()).toBeTruthy();
  const { passwords } = (await pwRes.json()) as { passwords: Array<{ id: string }> };
  expect(passwords.length).toBe(1);

  // A public read WITHOUT a credential is 401 password_required (not 404 — the
  // video's existence is revealed, but it is locked).
  const anon = await request.get(`${API_URL}/api/v1/videos/${mine!.id}`);
  expect(anon.status()).toBe(401);
  expect(((await anon.json()) as { error: { code: string } }).error.code).toBe("password_required");

  // Sign out → a visitor hits the unlock prompt in place of the player.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto(`/videos/${mine!.id}`);
  await expect(page.getByText("This video is password protected")).toBeVisible();

  // Wrong password is rejected inline; the player stays gated.
  await page.getByLabel("Video password").fill("not-the-password");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("That password is incorrect.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);

  // Correct password unlocks → the detail refetch (with the token) returns 200,
  // the title renders, and the player mounts.
  await page.getByLabel("Video password").fill(videoPassword);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator("video")).toHaveCount(1);
});

test("embed privacy persists and the embed page enforces it (disabled)", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-embed-${id}@example.test`;
  const account = "supersecret-e2e";
  const title = `Embed clip ${id}`;

  await signUpAndChannel(page, id, handle, email, account);
  await publishTinyVideo(page, title);

  // Edit → set embedding to "Nowhere (embedding off)" → save.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Where can this be embedded?").selectOption("disabled");
  const stored = page.waitForResponse(
    (r) => /\/embed-privacy$/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: "Save embed settings" }).click();
  await stored;

  // DB proof: the stored policy reads back as "disabled".
  const token = await loginToken(request, email, account);
  const mine = (await channelVideos(request, handle, token)).find((v) => v.title === title);
  expect(mine).toBeTruthy();
  const policyRes = await request.get(`${API_URL}/api/v1/videos/${mine!.id}/embed-privacy`);
  expect(policyRes.ok()).toBeTruthy();
  expect(((await policyRes.json()) as { status: string }).status).toBe("disabled");

  // The embed page blocks: the disabled panel renders, not the player.
  await page.goto(`/embed/${mine!.id}`);
  await expect(page.getByText("Embedding is disabled for this video.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
