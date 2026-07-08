import { expect, test } from "@playwright/test";

import {
  API_URL,
  TINY_MP4_BASE64,
  channelVideos,
  liveIngest,
  liveStreams,
  loginToken,
  publishViaStudioUI,
  seedPublishedChannel,
  uniqueId,
  videoChapters,
} from "./fixtures";

// Proves the CHUNKED (resumable) publish round trip against a real vidra-core +
// PostgreSQL: a creator signs up, creates a channel, and uploads a video in the
// studio via the chunked protocol (create session → PUT chunks → complete); the
// published video then appears on the public channel page after a fresh refetch.
// DB evidence (the videos + video_files rows) is captured separately via psql.
test("a creator can create a channel and publish a video (chunked upload)", async ({ page }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Studio clip ${id}`;

  // Sign up (the session lives in memory).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Open the studio (client-side nav) and create a channel.
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(channelName);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // Upload a real (tiny) video via the chunked protocol; the backend assembles
  // the chunks, runs ffprobe (which accepts it), and publishes it. `complete`
  // (POST /uploads/:id/complete) is the terminal call that finalises the video.
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

  // The published video appears on the public channel page (a fresh refetch).
  await page.getByRole("link", { name: new RegExp(channelName) }).first().click();
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();
});

// Proves the edit + delete round trips against a real vidra-core + PostgreSQL: a
// creator edits their video's title in the studio "Your videos" list and then
// deletes it; both changes are confirmed persisted by reading the public channel
// video list back through the API.
test("a creator can edit and delete their video", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Editable clip ${id}`;
  const newTitle = `Edited clip ${id}`;

  // Sign up and create a channel + publish a video (the only way to own one as the
  // signed-in UI user).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
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

  // Refresh "Your videos" to pick up the just-published video, then edit its title
  // (privacy stays public so the public read-back can see it). Scope to the list row
  // — the "Published!" message also links the video by its (old) title.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await expect(row.getByRole("link", { name: videoTitle })).toBeVisible();

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit title").fill(newTitle);
  const patched = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await patched;
  const updatedRow = page.getByRole("listitem").filter({ hasText: newTitle });
  await expect(updatedRow.getByRole("link", { name: newTitle })).toBeVisible();

  // Persisted: the public channel list shows the new title (and not the old one).
  const afterEdit = await channelVideos(request, handle);
  expect(afterEdit.map((v) => v.title)).toContain(newTitle);
  expect(afterEdit.map((v) => v.title)).not.toContain(videoTitle);

  // Delete it.
  await updatedRow.getByRole("button", { name: "Delete" }).click();
  const deleted = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Confirm" }).click();
  await deleted;
  await expect(page.getByRole("listitem").filter({ hasText: newTitle })).toHaveCount(0);

  // Persisted: the public channel list no longer contains the video.
  const afterDelete = await channelVideos(request, handle);
  expect(afterDelete.map((v) => v.title)).not.toContain(newTitle);
});

// Proves the chapters round trip against a real vidra-core + PostgreSQL (CORE-15):
// a creator adds a chapter in the studio edit surface, the whole-set PUT persists
// it, the API re-GET confirms the stored row (DB evidence), and a fresh load of the
// watch page shows the chapter (the current-chapter readout — duration-independent,
// unlike the >0s tick markers the sub-second CI fixture clip cannot position).
test("a creator can add chapters that persist and show on the watch page", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Chaptered clip ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
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

  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await publishViaStudioUI(page);
  await expect(page.getByText("Published!")).toBeVisible();

  // Open the edit surface for the just-published video and add a chapter at 0:00
  // (always valid regardless of the probed duration).
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await row.getByRole("button", { name: "Edit", exact: true }).click();

  await expect(page.getByText("No chapters yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add chapter" }).click();
  await page.getByLabel("Chapter 1 start").fill("0:00");
  await page.getByLabel("Chapter 1 title").fill("Intro");
  const saved = page.waitForResponse(
    (r) => /\/videos\/[^/]+\/chapters$/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: "Save chapters" }).click();
  await saved;
  await expect(page.getByText("Chapters saved.")).toBeVisible();

  // DB evidence: the chapter row persisted — read it straight back through the API.
  const vid = (await channelVideos(request, handle)).find((v) => v.title === videoTitle);
  expect(vid).toBeTruthy();
  const stored = await videoChapters(request, vid!.id);
  expect(stored).toEqual([{ start_seconds: 0, title: "Intro" }]);

  // A fresh load of the watch page refetches the chapters (has_chapters flipped
  // true) and renders the current-chapter title beside the time readout.
  await page.goto(`/videos/${vid!.id}`);
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();
  await expect(page.getByTestId("video-player").getByText("Intro")).toBeVisible();
});

// Proves custom-thumbnail upload against a real vidra-core + PostgreSQL: a creator
// uploads a PNG poster from the studio edit surface; the video's thumbnail is then
// served as image/png (distinguishing the uploaded poster from any ffmpeg-generated
// JPEG), confirming the upload persisted.
test("a creator can replace their video's thumbnail", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Poster clip ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
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

  // Open the edit surface for the just-published video and upload a PNG poster.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await row.getByRole("button", { name: "Edit" }).click();

  const thumbPosted = page.waitForResponse(
    (r) => /\/videos\/[^/]+\/thumbnail$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("Thumbnail image").setInputFiles({
    name: "poster.png",
    mimeType: "image/png",
    // A minimal valid PNG header + IHDR; the backend stores the bytes as-is and
    // serves them with a content type derived from the .png extension.
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await thumbPosted;
  await expect(page.getByRole("img", { name: "Current thumbnail" })).toBeVisible();

  // Persisted: the stored thumbnail is served as image/png (a custom upload, not the
  // ffmpeg-generated JPEG) — read back through the public thumbnail endpoint.
  const vid = (await channelVideos(request, handle)).find((v) => v.title === videoTitle);
  expect(vid).toBeTruthy();
  const res = await request.get(`${API_URL}/api/v1/videos/${vid!.id}/thumbnail`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

// Proves ASYNC URL import against a real vidra-core + PostgreSQL: a creator
// publishes a video by importing from a URL. The POST now returns 202 with a
// queued job and the studio POLLS GET /videos/:id/import until it is done, then
// reads the finalised video. The source is a seeded public video, imported by
// its own /original via the compose service name (http://api:8080/…) — no external
// origin needed. Requires HTTP_IMPORT_ALLOW_PRIVATE_URLS=true on the backend (set
// in the frontend-e2e-backed workflow); the Content-Type fallback accepts the
// extension-less /original path. The imported video then appears published on the
// importer's channel.
test("a creator can publish a video by importing from a URL (async job)", async ({ page, request }) => {
  // A public source whose /original the backend can fetch from within the network.
  const src = await seedPublishedChannel(request);

  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Imported clip ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
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

  // Import the source's own /original via the compose service name (reachable
  // inside the docker network; the frontend only submits the URL as a string).
  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByRole("radio", { name: "Import from URL" }).check();
  await page.getByLabel("Video URL").fill(`http://api:8080/api/v1/videos/${src.videoId}/original`);
  // The POST enqueues the job (202); the studio then polls until it is done.
  const enqueued = page.waitForResponse(
    (r) => /\/videos\/[^/]+\/import$/.test(r.url()) && r.request().method() === "POST" && r.status() === 202,
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await enqueued;
  // The background fetch + probe + poll can take a while — wait generously.
  await expect(page.getByText("Published!")).toBeVisible({ timeout: 60_000 });

  // Persisted: the importer's channel now carries the published, imported video.
  const vids = await channelVideos(request, handle);
  expect(vids.map((v) => v.title)).toContain(videoTitle);
});

// The false-success regression against the real pipeline: uploading bytes the
// backend's ffprobe rejects returns 201 with video.state="failed" — the UI must
// report the failure (never "Published!"). Persistence: the owner's channel list
// (authed read, which includes non-published states) carries the row as "failed".
test("a rejected upload is reported as failed, not published", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Broken clip ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // A .mp4 extension gets past the container allow-list, but the bytes are not a
  // video — the real ffprobe rejects them and the video is finalised as failed.
  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("these bytes are not a real video container"),
  });
  const uploaded = page.waitForResponse(
    (r) => /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await uploaded;

  await expect(
    page.getByText("Processing failed — the file could not be published", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);

  // Persisted: the owner's channel list shows the video in state "failed".
  const token = await loginToken(request, email, password);
  const mine = (await channelVideos(request, handle, token)).find((v) => v.title === videoTitle);
  expect(mine?.state).toBe("failed");
});

// A malformed import URL comes back 422 with a `url` field error from the real
// SSRF guard (non-http schemes are refused before any fetch); the UI maps it
// inline onto the Video URL input instead of a generic banner.
test("a non-http import URL shows an inline url field error", async ({ page }) => {
  const id = uniqueId();
  const handle = `ch${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  await page.getByLabel("Video title").fill(`Bad import ${id}`);
  await page.getByRole("radio", { name: "Import from URL" }).check();
  await page.getByLabel("Video URL").fill("ftp://example.com/clip.mp4");
  const attempted = page.waitForResponse(
    (r) =>
      /\/videos\/[^/]+\/import$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.status() === 422,
  );
  await page.getByRole("button", { name: "Publish" }).click();
  await attempted;

  await expect(page.getByText("must be a public http(s) URL")).toBeVisible();
  await expect(page.getByLabel("Video URL")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Published!")).toHaveCount(0);
});

// Proves the live-stream lifecycle against a real vidra-core + PostgreSQL: a
// creator makes a live stream in the studio, sees the stream key once, rotates it,
// and deletes it. Persistence is confirmed by reading the channel's live streams
// via the API (logging in as the creator) after create and after delete.
test("a creator can create, rekey, and delete a live stream", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const streamTitle = `Live show ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // Create a live stream → the key is shown once.
  await page.getByLabel("Live stream title").fill(streamTitle);
  const created = page.waitForResponse(
    (r) => /\/channels\/[^/]+\/live$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create live stream" }).click();
  await created;
  const firstKey = await page.getByLabel("Stream key").inputValue();
  expect(firstKey).not.toEqual("");

  // Persisted: reading the channel's live streams via the API (as the creator)
  // shows the new stream, offline.
  const token = await loginToken(request, email, password);
  const afterCreate = await liveStreams(request, handle, token);
  expect(afterCreate.map((s) => s.title)).toContain(streamTitle);
  expect(afterCreate.find((s) => s.title === streamTitle)?.state).toBe("offline");

  // Rotate the key → a new key, different from the first.
  const row = page.getByRole("listitem").filter({ hasText: streamTitle });
  const rekeyed = page.waitForResponse(
    (r) => /\/live\/[^/]+\/key$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await row.getByRole("button", { name: "Regenerate key" }).click();
  await rekeyed;
  const secondKey = await page.getByLabel("Stream key").inputValue();
  expect(secondKey).not.toEqual(firstKey);

  // Delete → gone from the API list too.
  const deleted = page.waitForResponse(
    (r) => /\/live\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await row.getByRole("button", { name: "Delete" }).click();
  await deleted;
  const afterDelete = await liveStreams(request, handle, token);
  expect(afterDelete.map((s) => s.title)).not.toContain(streamTitle);
});

// Proves the live-status round trip against a real vidra-core + PostgreSQL: a
// creator makes a live stream, the RTMP ingest boundary flips it live by its key
// (via the ingest hook), and the studio's Reload shows the "live" badge; stopping
// the ingest returns it to "ended". Requires LIVE_INGEST_SECRET on the backend
// (set in frontend-e2e-backed.yml).
test("a live stream shows LIVE after the ingest hook flips it", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const streamTitle = `Live status ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  await page.getByLabel("Live stream title").fill(streamTitle);
  const created = page.waitForResponse(
    (r) => /\/channels\/[^/]+\/live$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create live stream" }).click();
  await created;
  const key = await page.getByLabel("Stream key").inputValue();
  expect(key).not.toEqual("");

  const row = page.getByRole("listitem").filter({ hasText: streamTitle });
  await expect(row.getByText("offline", { exact: true })).toBeVisible();

  // The RTMP ingest boundary authenticates the key and flips the stream live.
  expect(await liveIngest(request, "start", key)).toBe(200);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(row.getByText("live", { exact: true })).toBeVisible();

  // Stopping the ingest ends the (one-shot) stream.
  expect(await liveIngest(request, "stop", key)).toBe(204);
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(row.getByText("ended", { exact: true })).toBeVisible();
});
