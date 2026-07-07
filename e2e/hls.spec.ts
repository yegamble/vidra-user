import { expect, test, type Page } from "@playwright/test";

// Mocked HLS playback coverage (a real backend is not running in `npm run ci`).
// Tiny valid m3u8 fixtures are served via page.route so REAL hls.js parses a
// real master playlist (MANIFEST_PARSED is what reveals the quality menu — the
// menu appearing proves the dynamic import, attachMedia, and manifest fetch all
// happened). Segment requests are aborted: actual frames are not asserted here
// (hermetic mock, no real encoder output); the full pipeline is proven against
// a real transcoded video in e2e-backed/hls-playback.spec.ts.
//
// The master advertises THREE rungs (1080p/720p/480p) so the quality selector is
// exercised against a real multi-rendition ladder — the W1.U1 requirement. Real
// multi-rendition switching depends on the backend ladder emitting >1 rung
// (vidra-core W1.C0 pins that contract; the backed spec asserts the real rung
// count and flips to ≥2 once that investigation closes).
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const MASTER = /\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/;
const VARIANT = /\/api\/v1\/videos\/v1\/hls\/\d+p\/playlist\.m3u8$/;
const SEGMENT = /\/api\/v1\/videos\/v1\/hls\/\d+p\/seg_\d+\.ts$/;

const HLS_DETAIL = {
  id: "v1",
  channel_id: "c1",
  title: "Adaptive Clip",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 12,
  has_thumbnail: false,
  duration_seconds: 8,
  hls_url: "/api/v1/videos/v1/hls/master.m3u8",
  renditions: [
    { height: 1080, width: 1920 },
    { height: 720, width: 1280 },
    { height: 480, width: 854 },
  ],
};

const MASTER_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x1080",
  "1080p/playlist.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=1540000,RESOLUTION=1280x720",
  "720p/playlist.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=968000,RESOLUTION=854x480",
  "480p/playlist.m3u8",
  "",
].join("\n");

const VARIANT_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXTINF:4.0,",
  "seg_00000.ts",
  "#EXTINF:4.0,",
  "seg_00001.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

// Mock the watch-page side endpoints that are not under test here.
async function mockWatchExtras(page: Page) {
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

async function mockHlsTree(page: Page) {
  await page.route(MASTER, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: MASTER_PLAYLIST }),
  );
  await page.route(VARIANT, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: VARIANT_PLAYLIST }),
  );
  await page.route(SEGMENT, (route) => route.abort());
}

test("the watch page streams HLS via hls.js and the quality menu drives level selection", async ({
  page,
}) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: HLS_DETAIL }));
  await page.route(ORIGINAL, (route) => route.abort());
  await mockWatchExtras(page);
  await mockHlsTree(page);
  const masterRequested = page.waitForRequest(MASTER);

  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Adaptive Clip" })).toBeVisible();

  // hls.js fetched the master playlist and attached MediaSource to the element
  // (a blob: src, not the backend original URL).
  await masterRequested;
  const quality = page.getByRole("button", { name: "Quality: Auto" });
  await expect(quality).toBeVisible();
  expect(await page.locator("video").getAttribute("src")).toMatch(/^blob:/);

  // The menu lists Auto (checked) + one entry per parsed rendition height,
  // tallest first (three synthetic rungs).
  await quality.click();
  const menu = page.getByRole("menu", { name: "Playback quality" });
  await expect(menu).toBeVisible();
  const items = menu.getByRole("menuitemradio");
  await expect(items).toHaveCount(4);
  await expect(items.nth(0)).toHaveAccessibleName("Auto");
  await expect(items.nth(1)).toHaveAccessibleName("1080p");
  await expect(items.nth(2)).toHaveAccessibleName("720p");
  await expect(items.nth(3)).toHaveAccessibleName("480p");
  await expect(menu.getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Selecting a rendition pins it: the button relabels (a smooth switch that
  // shows a busy "…" until it lands — no fragments load in the mock, so it stays
  // pending, which the substring name match tolerates), the selection persists.
  await menu.getByRole("menuitemradio", { name: "480p" }).click();
  const pinned = page.getByRole("button", { name: "Quality: 480p" });
  await expect(pinned).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(pinned).toBeFocused();
  await pinned.click();
  await expect(menu.getByRole("menuitemradio", { name: "480p" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Escape closes the menu and returns focus to the button.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(pinned).toBeFocused();
});

test("a missing HLS playlist falls back to the original file", async ({ page }) => {
  // The detail advertises hls_url but the playlist 404s (e.g. it was just
  // deleted/re-transcoding): the player degrades to progressive playback.
  await page.route(DETAIL, (route) => route.fulfill({ json: HLS_DETAIL }));
  await page.route(ORIGINAL, (route) => route.abort());
  await mockWatchExtras(page);
  await page.route(MASTER, (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "not_found", message: "playlist not ready" } },
    }),
  );

  await page.goto("/videos/v1");

  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "http://localhost:8080/api/v1/videos/v1/original",
    { timeout: 15_000 },
  );
  await expect(page.getByRole("button", { name: /^Quality:/ })).toHaveCount(0);
});

test("without MSE the master playlist plays natively and no selector is shown", async ({
  page,
}) => {
  // Simulate an MSE-less native-HLS browser (iOS Safari): this Chromium already
  // answers canPlayType("application/vnd.apple.mpegurl") with "maybe", so
  // removing MediaSource forces the native path.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.MediaSource;
    delete w.ManagedMediaSource;
    delete w.WebKitMediaSource;
  });
  await page.route(DETAIL, (route) => route.fulfill({ json: HLS_DETAIL }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(MASTER, (route) => route.abort()); // native fetch; not asserted
  await mockWatchExtras(page);

  await page.goto("/videos/v1");

  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "http://localhost:8080/api/v1/videos/v1/hls/master.m3u8",
  );
  // Native playback owns quality/ABR — nothing controllable, so no menu.
  await expect(page.getByRole("button", { name: /^Quality:/ })).toHaveCount(0);
});

test("a video without hls_url keeps progressive original playback and no selector", async ({
  page,
}) => {
  // JSON.stringify drops undefined values, so the detail carries no hls fields.
  const noHls = { ...HLS_DETAIL, hls_url: undefined, renditions: undefined };
  await page.route(DETAIL, (route) => route.fulfill({ json: noHls }));
  await page.route(ORIGINAL, (route) => route.abort());
  await mockWatchExtras(page);

  await page.goto("/videos/v1");

  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "http://localhost:8080/api/v1/videos/v1/original",
  );
  await expect(page.getByRole("button", { name: /^Quality:/ })).toHaveCount(0);
});

test("the embed player streams HLS with the same custom shell and quality menu", async ({
  page,
}) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: HLS_DETAIL }));
  await page.route(ORIGINAL, (route) => route.abort());
  await mockHlsTree(page);
  const masterRequested = page.waitForRequest(MASTER);

  await page.goto("/embed/v1");

  await masterRequested;
  await expect(page.getByRole("link", { name: "Adaptive Clip" })).toBeVisible();
  await expect
    .poll(async () => page.locator("video").getAttribute("src"))
    .toMatch(/^blob:/);
  // The embed runs the same bespoke shell (minus theater), so the quality menu
  // is present here too — the chrome-less native <video controls> is gone.
  expect(await page.locator("video").getAttribute("controls")).toBeNull();
  await expect(page.getByRole("button", { name: "Quality: Auto" })).toBeVisible();
});
