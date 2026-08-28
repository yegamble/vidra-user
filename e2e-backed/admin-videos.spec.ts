import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  adminToken,
  blockedVideos,
  seedPublishedChannel,
  videoIsPublic,
} from "./fixtures";

// Proves the admin videos-overview block/unblock round trip against a real
// vidra-core + PostgreSQL: the deterministic admin browses all videos, blocks a
// seeded video from the overview (it disappears from public surfaces and enters
// the block-list), then unblocks it (it returns). DB-confirmed via the block-list
// API and the public video-detail endpoint.
test("an admin blocks and unblocks a video from the videos overview", async ({ page, request }) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const token = await adminToken(request);
  expect(await videoIsPublic(request, videoId)).toBe(true);

  // The deterministic admin logs in through the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Moderation → All videos, then filter to the seeded video by title.
  await page.getByRole("link", { name: "Moderation" }).click();
  // Scoped: an unscoped name "Content" resolves to the page's "Skip to
  // content" skip-link first (substring matching), which sits off-viewport.
  await page
    .getByRole("navigation", { name: "Moderation sections" })
    .getByRole("link", { name: "Content" })
    .click();
  await page.getByLabel("Search videos by title").fill(videoTitle);
  await page.getByRole("button", { name: "Search" }).click();

  // The redesigned videos overview is a table; each video is a role="row" whose
  // block/unblock action lives in a per-row actions Dropdown (a menu button
  // labelled "Actions for <title>"), not an inline button.
  const row = page.getByRole("row").filter({ hasText: videoTitle });
  await expect(row).toBeVisible();
  const openActions = () => row.getByRole("button", { name: `Actions for ${videoTitle}` }).click();

  // Block it → the row gains a "Blocked" pill and the menu action flips to Unblock.
  const blocked = page.waitForResponse(
    (r) => /\/admin\/videos\/[^/]+\/block$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await openActions();
  await page.getByRole("menuitem", { name: "Block", exact: true }).click();
  await blocked;
  await expect(row.getByText("Blocked")).toBeVisible();

  // Persisted: it's in the block-list and hidden from the public detail endpoint.
  expect((await blockedVideos(request, token)).some((v) => v.video_id === videoId)).toBe(true);
  expect(await videoIsPublic(request, videoId)).toBe(false);

  // Unblock it → the "Blocked" pill clears and the video is public again.
  const unblocked = page.waitForResponse(
    (r) => /\/admin\/videos\/[^/]+\/block$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await openActions();
  await page.getByRole("menuitem", { name: "Unblock", exact: true }).click();
  await unblocked;
  await expect(row.getByText("Blocked")).toHaveCount(0);

  expect((await blockedVideos(request, token)).some((v) => v.video_id === videoId)).toBe(false);
  expect(await videoIsPublic(request, videoId)).toBe(true);
});
