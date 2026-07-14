import { expect, test } from "@playwright/test";

import { TINY_MP4_BASE64, captions, channelVideos, uniqueId } from "./fixtures";

// Backend-backed proof of the Whisper auto-caption round trip against a real
// vidra-core + PostgreSQL: a creator publishes a video, requests automatic
// captions from the studio edit surface, the async job runs, and the generated
// WebVTT track persists (visible via the public captions API).
//
// SKIPPED by default: auto-captioning requires the instance to be started with
// WHISPER_ENABLED=true pointing at a reachable Whisper transcription service, and
// a clip that actually carries an audio track to transcribe (the tiny synthetic
// fixture may not). Opt in explicitly with E2E_WHISPER=true when running the
// backed stack with that profile:
//
//   E2E_WHISPER=true npm run e2e:backed
//
// Without the flag this is a no-op skip, so `npm run e2e:backed` stays green on a
// stack that doesn't run Whisper. It is never part of `npm run ci`.
const WHISPER_ENABLED = process.env.E2E_WHISPER === "true";

test.describe("Whisper auto-captions (backed)", () => {
  test.skip(!WHISPER_ENABLED, "set E2E_WHISPER=true with a Whisper-enabled backed stack");

  test("a creator generates automatic captions from the studio", async ({ page, request }) => {
    const id = uniqueId();
    const handle = `ch${id}`;
    const channelName = `Channel ${id}`;
    const videoTitle = `Autocap clip ${id}`;

    // Sign up, create a channel, and publish a video (the only way to own one).
    await page.goto("/signup");
    await page.getByLabel("Username").fill(`fan${id}`);
    await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
    await page.getByLabel("Password").fill("supersecret-e2e");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

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
      (r) => /\/videos\/[^/]+\/file$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
    );
    await page.getByRole("button", { name: "Publish" }).click();
    await uploaded;
    await expect(page.getByText("Published!")).toBeVisible();

    // Open the video's edit surface (the captions manager lives there).
    await page.getByRole("button", { name: "Refresh" }).click();
    const row = page.getByRole("listitem").filter({ hasText: videoTitle });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("No captions yet.")).toBeVisible();

    // Request automatic captions (English hint) → the async job is enqueued (202).
    await page.getByLabel("Transcription language").selectOption("en");
    const requested = page.waitForResponse(
      (r) =>
        /\/videos\/[^/]+\/captions\/auto$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.ok(),
    );
    await page.getByRole("button", { name: "Generate automatically" }).click();
    await requested;

    // The UI polls the job to completion and refreshes the list. Whisper
    // transcription can take a while, so allow a generous window.
    await expect(page.getByText("Automatic captions added.")).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("button", { name: "Remove en caption" })).toBeVisible();

    // Persisted: the public captions API shows the generated track.
    const videoId = (await channelVideos(request, handle)).find((v) => v.title === videoTitle)!.id;
    expect((await captions(request, videoId)).some((c) => c.language === "en")).toBe(true);
  });
});
