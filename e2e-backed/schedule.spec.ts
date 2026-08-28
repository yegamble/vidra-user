import { expect, test } from "@playwright/test";

import {
  API_URL,
  TINY_MP4_BASE64,
  channelVideos,
  createChannelViaStudioUI,
  loginToken,
  ownerVideoDetail,
  publishViaStudioUI,
  uniqueId,
} from "./fixtures";

// Proves scheduled publish persists against a real vidra-core + PostgreSQL: a
// creator publishes with a future publish_at from the studio; the video parks in
// the "scheduled" state with the exact publish_at readable back through the API
// (the owner detail read — a scheduled video is 404 to the public), and a fresh
// studio refetch shows the Scheduled badge + time (not just optimistic state).
test("a scheduled publish persists publish_at and parks the video as scheduled", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Scheduled clip ${id}`;
  // A far-future schedule, entered in the browser's local zone by the
  // datetime-local field; the form converts it to this exact ISO instant.
  const scheduleLocal = "2030-01-02T12:30";
  const scheduleIso = new Date(scheduleLocal).toISOString();

  // Sign up (the session lives in memory) and create a channel.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await createChannelViaStudioUI(page, handle, `Channel ${id}`);

  // Publish a real (tiny) video with a future schedule. Selecting the file
  // AUTO-STARTS the upload, and finalising it server-side publishes the
  // (private) draft — after which publish_at is rejected (422). So HOLD the
  // browser's `complete` POST until the schedule PATCH has landed on the
  // still-draft video, then release it: the POST answers 202 and the finalize
  // worker then parks the processed video as "scheduled". Holding the POST is
  // still the right gate — nothing is queued until it goes through.
  let releaseComplete!: () => void;
  const completeGate = new Promise<void>((r) => {
    releaseComplete = r;
  });
  await page.route(/\/api\/v1\/uploads\/[^/]+\/complete$/, async (route) => {
    await completeGate;
    await route.continue();
  });
  const completed = page.waitForResponse(
    (r) => /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Upload video" }).click();
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByLabel("Schedule publish").fill(scheduleLocal);
  await publishViaStudioUI(page);
  releaseComplete();
  await completed;

  // The honest outcome: scheduled, never "Published!".
  await expect(
    page.getByText("is scheduled — it will publish automatically", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Published!")).toHaveCount(0);

  // Persisted: the owner's API read shows state=scheduled with the exact
  // publish_at instant (a scheduled video is hidden from the public detail).
  const token = await loginToken(request, email, password);
  const mine = (await channelVideos(request, handle, token)).find((v) => v.title === videoTitle);
  expect(mine).toBeTruthy();
  expect(mine!.state).toBe("scheduled");
  const detail = await ownerVideoDetail(request, mine!.id, token);
  expect(detail.state).toBe("scheduled");
  expect(detail.publish_at).toBeTruthy();
  expect(new Date(detail.publish_at!).toISOString()).toBe(scheduleIso);

  // Fresh refetch (not optimistic state): the studio row shows the Scheduled
  // badge + the human publish time.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await expect(row.getByText("scheduled", { exact: true })).toBeVisible();
  await expect(row.getByText("publishes", { exact: false })).toBeVisible();

  // And the public feed/detail does NOT serve it before the publish time.
  const publicRead = await request.get(`${API_URL}/api/v1/videos/${mine!.id}`);
  expect(publicRead.status()).toBe(404);
});

// Proves moving a schedule persists: the owner edits the scheduled time in the
// studio and the API detail read returns the moved instant.
test("moving a schedule from the edit surface persists the new publish_at", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const videoTitle = `Rescheduled clip ${id}`;
  const movedLocal = "2031-06-01T09:00";
  const movedIso = new Date(movedLocal).toISOString();

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await createChannelViaStudioUI(page, handle, `Channel ${id}`);

  // Same gated-complete choreography as above: the schedule PATCH must land
  // before the completion POST is allowed through (nothing is queued until it
  // is), because a finalised upload publishes the draft, after which publish_at
  // is rejected.
  let releaseComplete!: () => void;
  const completeGate = new Promise<void>((r) => {
    releaseComplete = r;
  });
  await page.route(/\/api\/v1\/uploads\/[^/]+\/complete$/, async (route) => {
    await completeGate;
    await route.continue();
  });
  const completed = page.waitForResponse(
    (r) => /\/uploads\/[^/]+\/complete$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Upload video" }).click();
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await page.getByLabel("Video title").fill(videoTitle);
  await page.getByLabel("Schedule publish").fill("2030-01-02T12:30");
  await publishViaStudioUI(page);
  releaseComplete();
  await completed;
  await expect(
    page.getByText("is scheduled — it will publish automatically", { exact: false }),
  ).toBeVisible();

  // Move the schedule from the edit surface.
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: videoTitle });
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit scheduled publish").fill(movedLocal);
  const patched = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await patched;

  // Persisted: the owner detail read carries the moved instant.
  const token = await loginToken(request, email, password);
  const mine = (await channelVideos(request, handle, token)).find((v) => v.title === videoTitle);
  expect(mine).toBeTruthy();
  const detail = await ownerVideoDetail(request, mine!.id, token);
  expect(detail.state).toBe("scheduled");
  expect(new Date(detail.publish_at!).toISOString()).toBe(movedIso);
});
