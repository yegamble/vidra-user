import { expect, test } from "@playwright/test";

// The IPFS source bar + player states (DR5). The video is IPFS-mirrored: its
// detail advertises a mirror and the session authorizes its exact master URL.
// The player prefers that mirror briefly, then falls back without an overlay.

const GATEWAY = "https://ipfs.example.test";
const HLS_CID = "bafyHLScid";
const GATEWAY_MASTER = `${GATEWAY}/ipfs/${HLS_CID}/hashed-import-master.m3u8`;

const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;

const SAMPLE_MASTER = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=1540000,RESOLUTION=1280x720",
  "720p/playlist.m3u8",
  "",
].join("\n");

// `pinnedFlag` mirrors the ONE way the real and the historically-mocked payloads
// differ: a live core sends the `ipfs` object with no `ipfs_pinned` key at all.
function detailWithIpfs(pinnedFlag = true) {
  return {
    ...(pinnedFlag ? { ipfs_pinned: true } : {}),
    id: "v1",
    channel_id: "c1",
    title: "Mirrored Clip",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
    duration_seconds: 42,
    hls_url: "/api/v1/videos/v1/hls/master.m3u8",
    renditions: [{ height: 720, width: 1280 }],
    ipfs: { hls_cid: HLS_CID, gateway_url: GATEWAY },
  };
}

// Shared hermetic mocks: detail + the always-present watch reads + the server HLS
// ladder (segments aborted — we assert chrome/state, not frames).
async function mockWatch(
  page: import("@playwright/test").Page,
  detail: object = detailWithIpfs(),
) {
  await page.route(/\/api\/v1\/videos\/v1\/playback-session$/, (route) => route.fulfill({ json: {
    session_id: "fixture", video_id: "v1", hls_url: "/api/v1/videos/v1/hls/master.m3u8",
    authoritative_hls_url: "/api/v1/videos/v1/hls/master.m3u8", ipfs_hls_url: GATEWAY_MASTER,
  } }));
  await page.route(new RegExp(`ipfs/${HLS_CID}/.+`), (route) => route.abort());
  await page.route(GATEWAY_MASTER, (route) => route.fulfill({
    headers: { "access-control-allow-origin": "*" }, contentType: "application/vnd.apple.mpegurl", body: SAMPLE_MASTER,
  }));
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/hls\/.+/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_MASTER }),
  );
}

test("prefers the session-authorized IPFS source with peer-free status", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Mirrored Clip" })).toBeVisible();
  await expect(page.getByText("Playing from IPFS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use server" })).toBeVisible();
  // No fabricated peer count anywhere on the surface.
  await expect(page.getByText(/peer/i)).toHaveCount(0);
});

// REGRESSION (verified 2026-09-03 against a live IPFS-enabled vidra-core): a real
// detail response carries the `ipfs` object and NO `ipfs_pinned` key. That flag is
// a CARD/FEED field — OpenAPI: "Drives the IPFS thumbnail badge on card/feed
// views" — attached by the list handlers only; handleGetVideo attaches just the
// `ipfs` object, whose CIDs are already emitted exclusively for a public+published
// video pinned on the PUBLIC swarm. WatchView used to require the flag, so the
// whole IPFS surface was dead against every real backend while this mocked suite,
// which fabricated it, stayed green. The live counterpart is e2e-backed/ipfs.spec.ts.
test("offers the mirror on a REAL core payload: CIDs present, no ipfs_pinned flag", async ({
  page,
}) => {
  await mockWatch(page, detailWithIpfs(false));
  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Mirrored Clip" })).toBeVisible();
  await expect(page.getByText("Playing from IPFS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use server" })).toBeVisible();
});

test("source controls switch actual engines using the exact imported master name", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await page.getByRole("button", { name: "Use server" }).click();
  await expect(page.getByText("Playing from server (HLS)")).toBeVisible();
  const request = page.waitForRequest(GATEWAY_MASTER);
  await page.getByRole("button", { name: "Use IPFS" }).click();
  const mirror = await request;
  expect(mirror.headers().authorization).toBeUndefined();
  expect(mirror.url()).not.toContain("pt=");
  await expect(page.getByText("Playing from IPFS")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use server" })).toBeVisible();
  await expect(page.getByText(/peer/i)).toHaveCount(0);
});

test("an unplayable gateway automatically returns to server HLS without covering the controls", async ({ page }) => {
  await mockWatch(page);
  // Parsing fails immediately; this tests the real HLS error path, not a probe.
  await page.route(GATEWAY_MASTER, (route) => route.fulfill({
    headers: { "access-control-allow-origin": "*" }, contentType: "application/vnd.apple.mpegurl", body: "invalid manifest",
  }));
  const attempted = page.waitForRequest(GATEWAY_MASTER);
  await page.goto("/videos/v1");
  await attempted;
  await expect(page.getByText("Playing from server (HLS)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use IPFS" })).toBeVisible();
  await expect(page.getByTestId("player-controls")).toBeVisible();
  await expect(page.getByText("Couldn't retrieve this video from IPFS")).toHaveCount(0);
  await expect(page.getByText(/peer/i)).toHaveCount(0);
});
