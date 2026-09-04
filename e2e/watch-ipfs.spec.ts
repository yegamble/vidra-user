import { expect, test } from "@playwright/test";

// The IPFS source bar + player states (DR5). The video is IPFS-mirrored: its
// detail carries `ipfs_pinned` and the gateway CIDs. Playback defaults to the
// authoritative server; a viewer can opt into the gateway mirror, whose real
// fetch outcome drives the ok / error state (peer-free copy throughout).

const GATEWAY = "https://ipfs.example.test";
const HLS_CID = "bafyHLScid";
const GATEWAY_MASTER = `${GATEWAY}/ipfs/${HLS_CID}/master.m3u8`;

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
  await page.route(/\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_MASTER }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/hls\/.+/, (route) => route.abort());
}

test("defaults to the server source with a peer-free bar and a 'Use IPFS' toggle", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Mirrored Clip" })).toBeVisible();
  await expect(page.getByText("Playing from server (HLS)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use IPFS" })).toBeVisible();
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
  await expect(page.getByText("Playing from server (HLS)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use IPFS" })).toBeVisible();
});

test("opting into IPFS probes the gateway and, on success, plays from the mirror", async ({
  page,
}) => {
  await mockWatch(page);
  // Gateway variants/segments abort; the master fulfill is registered LAST so it
  // wins for the master URL (Playwright matches most-recently-registered first).
  await page.route(new RegExp(`ipfs/${HLS_CID}/.+`), (route) => route.abort());
  await page.route(new RegExp(`${HLS_CID}/master\\.m3u8$`), (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_MASTER }),
  );

  await page.goto("/videos/v1");
  await page.getByRole("button", { name: "Use IPFS" }).click();

  // The bar settles on the pinned IPFS source with a "Use server" toggle back.
  await expect(page.getByText("IPFS · pinned")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use server" })).toBeVisible();
  await expect(page.getByText(/peer/i)).toHaveCount(0);
});

test("a failed gateway fetch shows the error state and 'Play from server' recovers", async ({
  page,
}) => {
  await mockWatch(page);
  // The gateway is unreachable — the probe fetch fails.
  await page.route(GATEWAY_MASTER, (route) => route.abort());

  await page.goto("/videos/v1");
  await page.getByRole("button", { name: "Use IPFS" }).click();

  // The player error overlay (peer-free) offers a re-fetch and a server fallback.
  await expect(page.getByText("Couldn't retrieve this video from IPFS")).toBeVisible();
  await expect(page.getByText(/peer/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Play from server" }).click();

  // Back on the server source.
  await expect(page.getByText("Playing from server (HLS)")).toBeVisible();
  await expect(page.getByText("Couldn't retrieve this video from IPFS")).toHaveCount(0);
});
