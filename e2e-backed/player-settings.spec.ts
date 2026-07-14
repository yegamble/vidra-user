import { expect, test } from "@playwright/test";

import { loginToken, playerSettings, seedPublishedChannel, uniqueId, waitForHls } from "./fixtures";

// Proves per-user player settings persist against a real vidra-core + PostgreSQL
// (PLAY-07 / W1.6): a user sets a default speed on /settings/playback; the
// merge-PUT is read back through the API (the player_settings row changed) AND
// survives a hard reload (the page refetches — not optimistic state) AND the
// bespoke player on a watch page starts at that default speed. Then it is toggled
// back, proving the merge write both ways.
test("the default playback speed persists, refetches, and drives the player", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const email = `e2e-playset-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI (the session lives in memory + refresh cookie).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`play${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Settings → Playback (client-side nav keeps the in-memory session).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page.getByRole("link", { name: "Manage playback settings" }).click();
  await expect(page.getByRole("heading", { name: "Playback", exact: true })).toBeVisible();

  // A never-saved user starts at the built-in defaults (1×). Set 1.5×.
  const speed = page.getByLabel("Default speed");
  await expect(speed).toHaveValue("1");
  const savedSpeed = page.waitForResponse(
    (r) =>
      /\/api\/v1\/me\/player-settings$/.test(r.url()) &&
      r.request().method() === "PUT" &&
      r.ok(),
  );
  await speed.selectOption("1.5");
  await savedSpeed;

  // Persisted: the API read shows default_speed = 1.5 (the row changed), other
  // fields keeping their defaults (the merge only touched default_speed).
  const token = await loginToken(request, email, password);
  const persisted = await playerSettings(request, token);
  expect(persisted.default_speed).toBe(1.5);
  expect(persisted.autoplay_next).toBe(true);
  expect(persisted.default_quality).toBe("auto");

  // Fresh load: the httpOnly refresh cookie restores the session and the page
  // refetches from the server — the select still reads 1.5×, not optimistic.
  await page.reload();
  await expect(page.getByLabel("Default speed")).toHaveValue("1.5");

  // The bespoke player consumes the effective default on a watch page: seed a
  // public, transcoded video and open it as the signed-in user.
  const seeded = await seedPublishedChannel(request);
  await waitForHls(request, seeded.videoId);
  await page.goto(`/videos/${seeded.videoId}`);
  await expect(page.getByRole("heading", { name: seeded.videoTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
    .toBe(1.5);

  // Toggle back to 1× and prove the merge writes the reversal too.
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page.getByRole("link", { name: "Manage playback settings" }).click();
  const savedBack = page.waitForResponse(
    (r) =>
      /\/api\/v1\/me\/player-settings$/.test(r.url()) &&
      r.request().method() === "PUT" &&
      r.ok(),
  );
  await page.getByLabel("Default speed").selectOption("1");
  await savedBack;
  const reverted = await playerSettings(request, token);
  expect(reverted.default_speed).toBe(1);
});
