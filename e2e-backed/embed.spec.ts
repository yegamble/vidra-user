import { expect, test } from "@playwright/test";

import { seedPublishedChannel } from "./fixtures";

// Proves the embed player against a real vidra-core + PostgreSQL: a published
// video is seeded via the API, and the /embed/{id} page renders the native
// player pointed at the real original-stream endpoint, with the video's title and
// no app chrome. Read-only (playback) page, so this proves the read contract
// against a real published row (mirrors the admin audit-log/system read proofs).
test("the embed player renders a real published video with no app chrome", async ({
  page,
  request,
}) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);

  await page.goto(`/embed/${videoId}`);

  const video = page.locator("video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute(
    "src",
    new RegExp(`/api/v1/videos/${videoId}/original$`),
  );
  await expect(page.getByRole("link", { name: videoTitle })).toBeVisible();

  // The embed route hides the app header/nav.
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
});

// A private/unknown video is not viewable in the embed (mirrors the backend 404).
test("the embed player hides a non-public video", async ({ page }) => {
  await page.goto("/embed/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("This video is not available.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
