import { expect, test } from "@playwright/test";

import { TINY_MP4_BASE64, channelVideos, createChannelViaStudioUI, uniqueId } from "./fixtures";

// Proves the BATCH upload round trip against a real vidra-core + PostgreSQL
// (W2.U4 / UPLOAD-10): a creator picks THREE real (tiny) video files at once, the
// studio switches to the batch queue and uploads them through the per-video
// resumable protocol (create draft → open session → PUT chunks → complete) at most
// two concurrently, and all three published videos then appear on the owner's
// channel after a fresh API refetch (the DB round-trip). yt-dlp / transcoding are
// not required — these are direct file uploads the backend's ffprobe accepts.
test("a creator can batch-upload three videos that all persist (chunked)", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;

  // Sign up (the session lives in memory).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Open the studio and create a channel (lands on the Content tab).
  await createChannelViaStudioUI(page, handle, channelName);

  // Open the upload sheet, then pick THREE real tiny videos at once → the batch
  // queue takes over.
  const clip = () => ({
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await page.getByRole("button", { name: "Upload video" }).click();
  await page.getByLabel("Video file").setInputFiles([
    { name: `batch-${id}-1.mp4`, ...clip() },
    { name: `batch-${id}-2.mp4`, ...clip() },
    { name: `batch-${id}-3.mp4`, ...clip() },
  ]);
  await expect(page.getByRole("list", { name: "Upload queue" }).getByRole("listitem")).toHaveCount(3);

  // The batch prefills Privacy from the instance defaults (compose default
  // "private"); this test asserts the videos are PUBLIC on the channel via an
  // unauthenticated read, so pick Public for the whole batch.
  await page.getByLabel("Batch privacy").selectOption("public");

  // Each row uploads through its own chunked session (terminal call: complete,
  // POST /uploads/:id/complete). Wait for all three "View video" links — one per
  // finalised video — the third having waited behind the concurrency cap of 2.
  await page.getByRole("button", { name: "Upload 3 videos" }).click();
  await expect(page.getByRole("link", { name: "View video" })).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByText("3 videos uploaded.")).toBeVisible();

  // Persisted: the owner's channel now carries all three published videos — read
  // straight back through the public API (a fresh refetch, not the UI's state).
  const titles = (await channelVideos(request, handle)).map((v) => v.title);
  expect(titles).toContain(`batch-${id}-1`);
  expect(titles).toContain(`batch-${id}-2`);
  expect(titles).toContain(`batch-${id}-3`);
});
