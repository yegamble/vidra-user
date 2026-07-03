import { expect, test } from "@playwright/test";

import { API_URL, seedPublishedChannel, waitForHls } from "./fixtures";

// Proves the transcoding → HLS playback pipeline against a real vidra-core +
// PostgreSQL (stack started with TRANSCODING_ENABLED=true): publishing a video
// enqueues a durable transcode job; once the worker finishes, the DETAIL
// response carries hls_url + renditions (the persistence evidence — the row and
// the stored playlist tree), the playlist endpoints serve the stored tree, and
// the watch page streams it via hls.js with the quality menu listing the real
// renditions. The seeded fixture is a tiny 16x16 clip, so the planned ladder is
// a single rung at the source's own size ("16p" — the backend plans one rung at
// the even-rounded source height when the source is shorter than every ladder
// rung).
test("a published video is transcoded to HLS and the watch page streams it with a quality menu", async ({
  page,
  request,
}) => {
  // Transcoding waits on a shared worker queue — under a full-suite run every
  // uploaded video is ahead of this one, so the default 30s test budget is not
  // enough for waitForHls's 90s polling deadline.
  test.setTimeout(150_000);
  const { videoId, videoTitle } = await seedPublishedChannel(request);

  // Transcoding is asynchronous: wait (poll the public detail) until the
  // pipeline has persisted the ladder. This is the DB-effect evidence — the
  // videos row now advertises its streaming playlist.
  const detail = await waitForHls(request, videoId);
  expect(detail.hls_url).toBe(`/api/v1/videos/${videoId}/hls/master.m3u8`);
  expect(detail.renditions?.length ?? 0).toBeGreaterThan(0);
  const heights = (detail.renditions ?? []).map((r) => r.height);

  // The stored playlist tree round-trips: master → variant playlist → segment
  // are all served by the real endpoints (awaited requests, no mocks).
  const master = await request.get(`${API_URL}${detail.hls_url}`);
  expect(master.status()).toBe(200);
  const masterBody = await master.text();
  expect(masterBody).toContain("#EXTM3U");
  expect(masterBody).toContain(`${heights[0]}p/playlist.m3u8`);

  const variant = await request.get(
    `${API_URL}/api/v1/videos/${videoId}/hls/${heights[0]}p/playlist.m3u8`,
  );
  expect(variant.status()).toBe(200);
  const variantBody = await variant.text();
  expect(variantBody).toContain("#EXTM3U");
  const segment = variantBody.split("\n").find((l) => /^seg_\d+\.ts$/.test(l.trim()));
  expect(segment).toBeTruthy();
  const seg = await request.get(
    `${API_URL}/api/v1/videos/${videoId}/hls/${heights[0]}p/${segment?.trim()}`,
  );
  expect(seg.status()).toBe(200);

  // The watch page picks the HLS stream (hls.js over MSE — a blob: MediaSource
  // src, not the progressive original) and the quality menu lists Auto plus the
  // real transcoded rendition heights once the manifest parses.
  await page.goto(`/videos/${videoId}`);
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();

  const quality = page.getByRole("button", { name: "Quality: Auto" });
  await expect(quality).toBeVisible();
  expect(await page.locator("video").getAttribute("src")).toMatch(/^blob:/);

  await quality.click();
  const menu = page.getByRole("menu", { name: "Playback quality" });
  await expect(menu.getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  for (const h of heights) {
    await expect(menu.getByRole("menuitemradio", { name: `${h}p` })).toBeVisible();
  }

  // Pinning a rendition sticks in the UI (drives hls.currentLevel).
  await menu.getByRole("menuitemradio", { name: `${heights[0]}p` }).click();
  await expect(page.getByRole("button", { name: `Quality: ${heights[0]}p` })).toBeVisible();
});
