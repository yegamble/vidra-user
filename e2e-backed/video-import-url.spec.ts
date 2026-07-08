import { expect, test } from "@playwright/test";

import { API_URL, channelVideos, loginToken, seedPublishedChannel, uniqueId } from "./fixtures";

// Import-from-URL (UPLOAD-09, backport W2.U2) against a real vidra-core +
// PostgreSQL. A creator imports a DIRECT file URL (no yt-dlp needed in CI — the
// resolver "auto" path falls back to a plain HTTP(S) media fetch): the source's
// own /original, reachable inside the compose network via the `api` service name.
// This proves the whole slice end to end:
//   1. the async import enqueues (202) and the studio's stage rail renders;
//   2. the import_jobs row transitions to `done` (polled via GET /import);
//   3. the finalised video appears PUBLISHED on the owner's channel after refetch.
// Requires HTTP_IMPORT_ALLOW_PRIVATE_URLS=true on the backend (set in the
// frontend-e2e-backed workflow) so the compose-internal source URL passes the
// SSRF guard; the Content-Type fallback accepts the extension-less /original path.
test("a creator imports a video from a direct URL — rail runs, import_job transitions, video publishes", async ({
  page,
  request,
}) => {
  // A public source whose /original the backend can fetch from within the network.
  const src = await seedPublishedChannel(request);

  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const videoTitle = `Imported clip ${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";

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

  // Switch to the Import-from-URL tab (segmented source control) and submit the
  // source's own /original via the compose service name.
  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByRole("button", { name: "Import from URL" }).click();
  // The URL must be reachable FROM the backend container, so it uses the compose
  // service name `api:8080` (not the host-facing API_URL) — matching the existing
  // backed import test.
  await page
    .getByLabel("Video URL")
    .fill(`http://api:8080/api/v1/videos/${src.videoId}/original`);

  // The POST enqueues the job (202, resolver "auto"); the studio then polls
  // GET /videos/:id/import and drives the stage rail.
  const enqueued = page.waitForResponse(
    (r) =>
      /\/videos\/[^/]+\/import$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.status() === 202,
  );
  await page.getByRole("button", { name: "Publish" }).click();
  const enqueuedRes = await enqueued;

  // The stage rail is the W2.U2 UI — it renders while the import runs.
  await expect(page.getByRole("list", { name: "Import progress" })).toBeVisible();

  // The enqueue response body is the ImportJob contract (state + resolver).
  const enqueuedJob = (await enqueuedRes.json()) as {
    import_job: { video_id: string; state: string; resolver: string };
  };
  const importedVideoId = enqueuedJob.import_job.video_id;
  expect(["pending", "running", "done"]).toContain(enqueuedJob.import_job.state);

  // The background fetch + probe + poll can take a while — wait generously.
  await expect(page.getByText("Published!")).toBeVisible({ timeout: 60_000 });

  // DB-proof (1): the import_jobs row transitioned to `done` (read authed via the
  // same GET the studio polled).
  const token = await loginToken(request, email, password);
  const importRes = await request.get(
    `${API_URL}/api/v1/videos/${importedVideoId}/import`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(importRes.ok()).toBeTruthy();
  const importBody = (await importRes.json()) as { import_job: { state: string; resolver: string } };
  expect(importBody.import_job.state).toBe("done");
  // resolver "auto" was rewritten to the concrete mechanism the worker ran (a
  // direct file fetch here).
  expect(importBody.import_job.resolver).toBe("direct");

  // DB-proof (2): the importer's channel carries the published, imported video
  // after a fresh refetch.
  const vids = await channelVideos(request, handle, token);
  const imported = vids.find((v) => v.title === videoTitle);
  expect(imported).toBeTruthy();
  expect(imported?.state).toBe("published");
});
