import { expect, test } from "@playwright/test";

import { API_URL, channelVideos, loginToken, TINY_MP4_BASE64, uniqueId } from "./fixtures";

// Proves server-side draft recovery (W2.U1 / UPLOAD-02/03) against a REAL
// vidra-core + PostgreSQL. A resumable upload session is opened + partially
// filled DIRECTLY via the API — bytes the browser's localStorage never recorded —
// then the studio is HARD-RELOADED: the cookie-mode session rehydrates and
// GET /api/v1/me/uploads must surface the session in the "Resume an upload" card
// (server truth, not a local cache). Re-picking the file resumes it through the
// same complete → AttachOriginal → Process pipeline, and the finished video is
// read back from Postgres via the owner-authed channel list (the refetch proof).
//
// The upload session carries no client fingerprint here, so the card verifies the
// re-picked file by name + size; the fingerprint COMPUTE-and-send path is proven
// in the unit + mocked specs (createUploadSession sends a SHA-256 hex fingerprint;
// a mismatched re-pick is rejected before any chunk moves).
test("a server-side upload session appears in the recovery card after reload and resumes to a persisted video", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-recover-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Recovered clip ${id}`;

  // 1. Sign up + create a channel through the UI (cookie-mode session so the
  //    later hard reload rehydrates it).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`rec${id}`);
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

  // 2. Seed a HALF-FINISHED resumable upload directly via the API — a real video
  //    file, a draft, an opened session, and one chunk PUT — none of which the
  //    browser's localStorage ever recorded. The server is the only record.
  const token = await loginToken(request, email, password);
  const auth = { Authorization: `Bearer ${token}` };
  const mp4 = Buffer.from(TINY_MP4_BASE64, "base64");

  const draftRes = await request.post(`${API_URL}/api/v1/channels/${handle}/videos`, {
    headers: auth,
    data: { title: videoTitle, privacy: "public" },
  });
  expect(draftRes.ok()).toBeTruthy();
  const videoId = ((await draftRes.json()) as { id: string }).id;

  const sessRes = await request.post(`${API_URL}/api/v1/videos/${videoId}/upload-session`, {
    headers: auth,
    data: { size: mp4.length, filename: "clip.mp4" },
  });
  expect(sessRes.ok()).toBeTruthy();
  const sess = (await sessRes.json()) as { upload_id: string; chunk_size: number; total_chunks: number };

  // The tiny mp4 fits one chunk — PUT chunk 0 so the session is on the server,
  // unfinished (never completed).
  const chunkRes = await request.put(`${API_URL}/api/v1/uploads/${sess.upload_id}/chunks/0`, {
    headers: { ...auth, "content-type": "application/octet-stream" },
    data: mp4,
  });
  expect(chunkRes.ok()).toBeTruthy();

  // 3. HARD RELOAD: cookie-mode refresh rehydrates the session and the recovery
  //    card lists the server-side upload — the browser never cached it locally.
  await page.reload();
  const card = page.getByRole("region", { name: "Unfinished uploads" });
  const row = card.getByRole("listitem").filter({ hasText: "clip.mp4" });
  await expect(row).toBeVisible();

  // 4. Resume: re-pick the same file → PUT any missing chunks → complete, which
  //    assembles the real mp4 and finalises it through the scan/probe pipeline.
  const completed = page.waitForResponse(
    (r) => /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await row.locator('input[type="file"]').setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: mp4,
  });
  await completed;
  await expect(page.getByText("Upload finished.")).toBeVisible();

  // 5. Persisted: the owner-authed channel list carries the finalised video after
  //    a fresh API read — the draft became a real, no-longer-draft video row.
  const mine = await channelVideos(request, handle, token);
  const finalised = mine.find((v) => v.title === videoTitle);
  expect(finalised).toBeTruthy();
  expect(finalised!.state).not.toBe("draft");
  expect(["published", "processing", "quarantined"]).toContain(finalised!.state);
});
