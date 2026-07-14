import { expect, test } from "@playwright/test";

import { channelVideos, loginToken, uniqueId } from "./fixtures";

// Proves CHUNKED-upload cancellation against a real vidra-core + PostgreSQL: a
// creator starts a resumable upload (create session → PUT chunks), the
// determinate progress UI appears, and Cancel aborts the in-flight chunk —
// the form returns to an editable state, the upload session is DELETEd (dropping
// its chunk blobs), and the orphaned draft video is best-effort DELETEd (both
// awaited here). Persistence of the cleanup: the owner-authed channel list
// (which includes drafts and every other state) carries NO row for the cancelled
// upload after a fresh API read — a cancelled session leaves NO published video.
//
// CDP upload throttling (~512 KB/s) keeps the 16 MB body in flight for tens of
// seconds so the cancel lands deterministically mid-chunk; the chunk never
// finishes arriving, so its content is irrelevant (the video is never assembled).
test("a cancelled chunked upload leaves no session and no published video", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Cancelled clip ${id}`;

  // Sign up and create a channel (full speed — throttling starts later).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // Throttle the page's upload throughput so the 16 MB body stays in flight.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: 512 * 1024,
  });

  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByLabel("Video file").setInputFiles({
    name: "big.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.alloc(16 * 1024 * 1024),
  });
  await page.getByRole("button", { name: "Publish" }).click();

  // The determinate progress UI is up while the upload is in flight.
  await expect(page.getByRole("progressbar", { name: "Upload progress" })).toBeVisible();

  // Cancel → the abort fires a DELETE of the upload session (dropping its chunks)
  // and a best-effort DELETE of the just-created draft (both awaited: the 204s are
  // the backend acknowledging the session and the draft row are gone).
  const sessionDeleted = page.waitForResponse(
    (r) => /\/api\/v1\/uploads\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  const draftDeleted = page.waitForResponse(
    (r) => /\/api\/v1\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Cancel upload" }).click();
  await sessionDeleted;
  await draftDeleted;

  // Back to an editable form; nothing claims success and the values are kept.
  await expect(page.getByText("Upload cancelled", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  await expect(page.getByText("Published!")).toHaveCount(0);
  await expect(page.getByLabel("Video title")).toHaveValue(videoTitle);

  // Un-throttle before the read-back (the request fixture bypasses the page
  // anyway, but leave the page usable for any retry/debugging).
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // Persisted: the owner-authed channel list (drafts included) has NO row for
  // the cancelled upload — the orphaned draft really was deleted in PostgreSQL.
  const token = await loginToken(request, email, password);
  const mine = await channelVideos(request, handle, token);
  expect(mine.map((v) => v.title)).not.toContain(videoTitle);
});
