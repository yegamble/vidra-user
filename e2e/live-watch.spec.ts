import { expect, test, type Page } from "@playwright/test";

// Mocked live-watch coverage (no real backend in `npm run ci`; the media plane
// is proven end to end against a real vidra-core in e2e-backed/). The /live/[id]
// surface loads a single live stream and, when it is live with an HLS playlist,
// plays it via the SHARED HLS util (lib/use-live-playback → lib/hls + hls.js) —
// the same pipeline the VOD watch page uses. Tiny valid m3u8 fixtures are served
// so REAL hls.js parses a real master playlist (the quality menu appearing proves
// the dynamic import + attachMedia + manifest fetch happened); segments are
// aborted (no real encoder output in a hermetic mock).
const LIVE = /\/api\/v1\/live\/ls1$/;
const MASTER = /\/api\/v1\/live\/ls1\/hls\/master\.m3u8$/;
const VARIANT = /\/api\/v1\/live\/ls1\/hls\/\d+p\/playlist\.m3u8$/;
const SEGMENT = /\/api\/v1\/live\/ls1\/hls\/\d+p\/seg_\d+\.ts$/;

function liveStream(overrides: Record<string, unknown> = {}) {
  return {
    id: "ls1",
    channel_id: "c1",
    title: "Ada's Live Show",
    description: "Streaming right now",
    privacy: "public",
    state: "live",
    permanent: false,
    replay_enabled: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    channel_handle: "ada_makes",
    channel_display_name: "Ada Makes",
    hls_url: "/api/v1/live/ls1/hls/master.m3u8",
    ...overrides,
  };
}

const MASTER_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=1540000,RESOLUTION=1280x720",
  "720p/playlist.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=968000,RESOLUTION=854x480",
  "480p/playlist.m3u8",
  "",
].join("\n");

// A live (non-ENDLIST) media playlist — a real live edge, without the VOD terminator.
const VARIANT_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXTINF:4.0,",
  "seg_00000.ts",
  "#EXTINF:4.0,",
  "seg_00001.ts",
  "",
].join("\n");

async function mockHlsTree(page: Page) {
  await page.route(MASTER, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: MASTER_PLAYLIST }),
  );
  await page.route(VARIANT, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: VARIANT_PLAYLIST }),
  );
  await page.route(SEGMENT, (route) => route.abort());
}

test("a live stream plays via hls.js with a quality menu", async ({ page }) => {
  await page.route(LIVE, (route) => route.fulfill({ json: liveStream() }));
  await mockHlsTree(page);
  const masterRequested = page.waitForRequest(MASTER);

  await page.goto("/live/ls1");
  await expect(page.getByRole("heading", { name: "Ada's Live Show" })).toBeVisible();

  // hls.js fetched the master playlist and attached MediaSource (a blob: src).
  await masterRequested;
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", /^blob:/, { timeout: 15_000 });

  // MANIFEST_PARSED revealed the quality menu (Auto + one per rendition height).
  const quality = page.getByRole("button", { name: "Quality: Auto" });
  await expect(quality).toBeVisible();
  await quality.click();
  const menu = page.getByRole("menu", { name: "Playback quality" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(3);

  // The channel is linked for viewers to navigate back.
  await expect(page.getByRole("link", { name: "Ada Makes" })).toHaveAttribute(
    "href",
    "/channels/ada_makes",
  );
});

test("an offline stream shows a not-live-yet state and does not play", async ({ page }) => {
  // JSON.stringify drops undefined, so an offline stream carries no hls_url.
  await page.route(LIVE, (route) =>
    route.fulfill({ json: liveStream({ state: "offline", hls_url: undefined }) }),
  );

  await page.goto("/live/ls1");
  await expect(page.getByText("Not live yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ada's Live Show" })).toBeVisible();
  // Honest: no dead <video> element while the stream is offline.
  await expect(page.locator("video")).toHaveCount(0);
});

test("an ended stream with replay enabled explains the replay will appear as a video", async ({
  page,
}) => {
  await page.route(LIVE, (route) =>
    route.fulfill({
      json: liveStream({ state: "ended", replay_enabled: true, hls_url: undefined }),
    }),
  );

  await page.goto("/live/ls1");
  await expect(page.getByText("Stream ended")).toBeVisible();
  await expect(
    page.getByText("replay will appear as a normal video", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("an ended stream without replay simply says it ended", async ({ page }) => {
  await page.route(LIVE, (route) =>
    route.fulfill({
      json: liveStream({ state: "ended", replay_enabled: false, hls_url: undefined }),
    }),
  );

  await page.goto("/live/ls1");
  await expect(page.getByText("This live stream has ended.")).toBeVisible();
  await expect(page.getByText("replay will appear", { exact: false })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

test("an unknown or private live stream shows a not-found state", async ({ page }) => {
  await page.route(LIVE, (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "not_found", message: "no such live stream" } },
    }),
  );

  await page.goto("/live/ls1");
  await expect(page.getByText("Live stream not found")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
