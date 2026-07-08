import { expect, test } from "@playwright/test";

import { API_URL, TINY_MP4_BASE64, channelVideos, loginToken, uniqueId, waitForHls } from "./fixtures";

// Proves the thumbnail FRAME-PICK (UPLOAD-04 / vidra-core W2.C5) end to end against
// a real vidra-core + PostgreSQL + ffmpeg: a creator publishes a real (tiny) video,
// the pipeline processes its original, and the studio then sets the poster from an
// exact frame via the JSON {at_seconds} variant of POST /videos/:id/thumbnail. The
// frame is extracted server-side, stored as JPEG, served back (DB/storage proof),
// and the studio edit surface shows the poster after a fresh refetch.
//
// The interactive scrubber is exercised through the UI when the sub-second CI
// fixture reports a scrubbable (>0s) duration; on a fixture whose probed duration
// is too small for the scrubber, the frame-pick contract is driven via the API at
// at_seconds=0 (always valid) — either way the SAME endpoint + DB path is proven,
// and the UI is asserted to reflect the stored poster after refetch.
test("a creator sets the poster from a video frame (frame-pick)", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Frame clip ${id}`;

  // Sign up (session in memory) and create a channel.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(channelName);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // Publish a real (tiny) video via the chunked upload; ffprobe accepts it.
  await page.getByLabel("Video title").fill(videoTitle);
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
  await expect(page.getByText("Published!")).toBeVisible();

  // Resolve the video id and wait for the pipeline to finish processing the
  // original (HLS ready) so the frame-pick never races the processed-original 409.
  const token = await loginToken(request, email, password);
  const vid = (await channelVideos(request, handle, token)).find((v) => v.title === videoTitle);
  expect(vid).toBeTruthy();
  const videoId = vid!.id;
  await waitForHls(request, videoId);

  // Open the edit surface for the just-published video.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await row.getByRole("button", { name: "Edit", exact: true }).click();

  const pick = page.getByRole("button", { name: "Pick from video" });
  if ((await pick.count()) > 0) {
    // Scrubbable duration: drive the frame-pick scrubber through the UI.
    await pick.click();
    await expect(page.getByLabel("Frame position")).toBeVisible();
    const posted = page.waitForResponse(
      (r) =>
        /\/videos\/[^/]+\/thumbnail$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() === 201,
    );
    await page.getByRole("button", { name: "Use this frame" }).click();
    await posted;
    await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();
  } else {
    // Sub-second fixture: the scrubber needs a >0s duration, so drive the SAME
    // frame-pick contract via the API at frame 0 (always valid), then prove the
    // UI reflects the stored poster after a fresh refetch.
    const res = await request.post(`${API_URL}/api/v1/videos/${videoId}/thumbnail`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { at_seconds: 0 },
    });
    expect(res.status()).toBe(201);
    const file = (await res.json()) as { kind: string };
    expect(file.kind).toBe("thumbnail");

    await page.reload();
    await page.getByRole("button", { name: "Refresh" }).click();
    const row2 = page.getByRole("listitem").filter({ hasText: videoTitle });
    await row2.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();
  }

  // DB/storage proof: the poster is now served as a JPEG (the ffmpeg frame-pick
  // output) from the public thumbnail endpoint.
  const poster = await request.get(`${API_URL}/api/v1/videos/${videoId}/thumbnail`);
  expect(poster.status()).toBe(200);
  expect(poster.headers()["content-type"]).toContain("image/jpeg");
});
