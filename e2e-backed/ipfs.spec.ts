import { expect, test } from "@playwright/test";

import { seedPublishedChannel, waitForHls, waitForIpfsPin } from "./fixtures";

// Proves the IPFS mirror end to end against a REAL vidra-core + PostgreSQL + a
// REAL kubo node (the compose `ipfs` profile, stack started with
// IPFS_ENABLED=true and TRANSCODING_ENABLED=true): publishing a video transcodes
// it, the transcode-completion hook arms an add+pin of the HLS wrap-directory,
// the drain worker pins it and records the CID, the detail then advertises that
// CID under the configured gateway, the gateway actually resolves the tree, and
// the watch page can switch playback onto the mirror.
//
// This is the un-mocked counterpart of e2e/watch-ipfs.spec.ts, which fabricates
// `ipfs_pinned`, `ipfs.hls_cid`, `ipfs.gateway_url` AND the gateway's response —
// four inventions, so nothing there can fail when the real mirror does. Nothing
// here is stubbed: the CID is whatever kubo minted, and every assertion below is
// an awaited request against a service the test did not write.
//
// Deliberately NOT asserted: peer counts, DHT/provider records, or anything about
// the public network. The compose node runs IPFS_PUBLIC_NETWORK=false (local-only
// swarm) in CI, which is the whole point — mirroring is proven without publishing
// test fixtures onto the real public network.

/** Playlist URIs advertised by each #EXT-X-STREAM-INF in a master playlist. */
function variantURIs(master: string): string[] {
  const lines = master.split("\n").map((l) => l.trim());
  const uris: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const uri = lines.slice(i + 1).find((l) => l !== "" && !l.startsWith("#"));
    if (uri) uris.push(uri);
  }
  return uris;
}

test("a published video is pinned to IPFS, resolves through the real gateway, and the watch page plays from the mirror", async ({
  page,
  request,
}) => {
  // Three asynchronous stages behind a shared worker queue — transcode (up to
  // 90s), then the jittered pin drain (up to 120s), then the browser leg.
  test.setTimeout(360_000);

  const { videoId, videoTitle } = await seedPublishedChannel(request);

  // 1. The ladder must exist before there is anything to pin: the HLS add is
  //    armed by the transcode-completion hook, not by the upload.
  await waitForHls(request, videoId);

  // 2. The pin is the DB-effect evidence: the ledger row reached state='pinned'
  //    on the PUBLIC swarm and the detail now advertises a real, validated CID.
  const detail = await waitForIpfsPin(request, videoId);
  const cid = detail.ipfs?.hls_cid ?? "";
  const gateway = (detail.ipfs?.gateway_url ?? "").replace(/\/+$/, "");
  // CIDv1, which is what core validates before it will emit one.
  expect(cid).toMatch(/^baf[a-z2-7]{20,}$/);
  expect(gateway).toMatch(/^https?:\/\//);

  // 3. The CID actually resolves through the REAL gateway — content-addressed,
  //    no origin involved. Following the URI the master advertises (rather than
  //    rebuilding one from a naming convention) also proves NESTED path
  //    resolution under the wrap-directory root, which is the property the whole
  //    "pin the HLS tree as one directory" design rests on.
  const masterURL = `${gateway}/ipfs/${cid}/master.m3u8`;
  const master = await request.get(masterURL);
  expect(master.status(), `gateway did not serve ${masterURL}`).toBe(200);
  const masterBody = await master.text();
  expect(masterBody).toContain("#EXTM3U");
  const variants = variantURIs(masterBody);
  expect(variants.length, `no #EXT-X-STREAM-INF variant in:\n${masterBody}`).toBeGreaterThan(0);

  const variant = await request.get(new URL(variants[0], masterURL).toString());
  expect(variant.status()).toBe(200);
  const variantBody = await variant.text();
  expect(variantBody).toContain("#EXTM3U");
  // An fMP4 (CMAF) tree is unplayable without its initialisation segment, so
  // when the media playlist maps one, prove the gateway serves that too.
  const map = /#EXT-X-MAP:URI="([^"]+)"/.exec(variantBody);
  if (map) {
    const init = await request.get(new URL(map[1], new URL(variants[0], masterURL)).toString());
    expect(init.status()).toBe(200);
  }

  // 4. The watch page. It defaults to the authoritative server ladder and OFFERS
  //    the mirror — the offer itself is a real assertion: it exists only because
  //    the detail carried a pinned CID + gateway.
  //
  // Everything below is scoped to the <main> landmark ON PURPOSE. This is a
  // FULL page load of a server-rendered route, so until React finishes hydrating
  // there is a SECOND, `hidden` copy of the streamed markup parked at the end of
  // <body> — outside #main-content. Plain text locators match it (strict mode:
  // "resolved to 2 elements", which no amount of retrying clears while hydration
  // is still pending under CI load), and so would a bare `page.locator("video")`.
  // Role-based queries skip it because a hidden subtree is not in the a11y tree,
  // and scoping through one makes every text/CSS locator below inherit that.
  await page.goto(`/videos/${videoId}`);
  const stage = page.getByRole("main");
  await expect(stage.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();
  await expect(stage.getByText("Playing from server (HLS)")).toBeVisible();

  // Opting in probes the gateway for real (WatchView fetches the master itself)
  // and then hands the same URL to hls.js, which follows it INTO the tree. Both
  // waiters are armed BEFORE the click: a waitForResponse only sees traffic that
  // happens after it is created, and the deeper fetch can land first.
  const probed = page.waitForResponse((r) => r.url() === masterURL && r.status() === 200, {
    timeout: 30_000,
  });
  const streamedFromGateway = page.waitForResponse(
    (r) => r.url().startsWith(`${gateway}/ipfs/${cid}/`) && r.url() !== masterURL && r.ok(),
    { timeout: 30_000 },
  );
  await stage.getByRole("button", { name: "Use IPFS" }).click();
  await probed;

  // The bar settles on the pinned source (peer-free copy) and offers the way back.
  await expect(stage.getByText("IPFS · pinned")).toBeVisible();
  await expect(stage.getByRole("button", { name: "Use server" })).toBeVisible();
  await expect(stage.getByText(/peer/i)).toHaveCount(0);

  // ...and the player is streaming through MSE, i.e. hls.js is driving playback
  // from the override master rather than the element having been pointed at the
  // progressive original.
  expect(await stage.locator("video").getAttribute("src")).toMatch(/^blob:/);

  // The strongest browser-side proof: hls.js followed the IPFS master INTO the
  // tree, so bytes for this playback are coming from the gateway, not the origin.
  await streamedFromGateway;
});
