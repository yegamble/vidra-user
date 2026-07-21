import { expect, test, type Page } from "@playwright/test";

// Publish-timing (publish_after_transcode): the watch page's "still processing"
// note. The DETAIL view carries `transcoding: true` while a transcode job is
// live; the note renders below the player, polls the detail every ~30s, and
// removes itself once a poll comes back without the flag. All backend calls are
// route-mocked (no backend in `npm run ci`); the poll interval is crossed with
// Playwright's fake clock rather than waiting real time.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

const NOTE = "This video is still being processed.";

function video(transcoding: boolean) {
  return {
    id: "v1",
    channel_id: "c1",
    title: "Fresh clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 3,
    has_thumbnail: false,
    channel_handle: "h-c1",
    channel_display_name: "Channel c1",
    // DETAIL-only flag: absent means false on the contract, so the mock omits
    // it entirely once the transcode finished.
    ...(transcoding ? { transcoding: true } : {}),
  };
}

async function mockWatchPage(page: Page) {
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

test("the watch page shows the processing note while transcoding and clears it after a poll", async ({
  page,
}) => {
  // Fake the page clock BEFORE any script runs so the note's 30s poll interval
  // can be crossed instantly.
  await page.clock.install();
  // First detail read (the page load) reports a live transcode; every later
  // read (the poll) comes back without the flag — the transcode finished.
  let detailReads = 0;
  await page.route(DETAIL, (route) => {
    detailReads += 1;
    return route.fulfill({ json: video(detailReads === 1) });
  });
  await mockWatchPage(page);

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Fresh clip" })).toBeVisible();

  // The subtle status note renders below the player.
  const note = page.getByRole("status").filter({ hasText: NOTE });
  await expect(note).toBeVisible();

  // Cross the poll interval: the re-read reports the transcode done and the
  // note removes itself. (No player hot-swap — the copy covers it.)
  await page.clock.fastForward(31_000);
  await expect(note).toHaveCount(0);
  expect(detailReads).toBeGreaterThanOrEqual(2);
});

test("a video with no live transcode never shows the processing note", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: video(false) }));
  await mockWatchPage(page);

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Fresh clip" })).toBeVisible();
  await expect(page.getByText(NOTE, { exact: false })).toHaveCount(0);
});
