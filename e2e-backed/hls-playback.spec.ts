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
//
// PACKAGER-AGNOSTIC BY DESIGN. The backend packages CMAF by default
// (TRANSCODING_PACKAGER=cmaf) but documents an MPEG-TS rollback
// (TRANSCODING_PACKAGER=ts), and the format is recorded PER VIDEO at transcode
// time — so a back catalogue transcoded before the switch keeps serving TS
// forever, and the two trees are mutually exclusive (asking a CMAF video for
// `16p/playlist.m3u8`, or a TS video for `cmaf/media_0.m3u8`, is a hard 404).
// This test therefore never reconstructs a path from a naming convention: it
// FOLLOWS the URIs the master itself advertises, and only asserts that their
// shape is one of the two packagings the backend supports. That is strictly
// stronger than pinning one string — a master that advertises something the
// origin will not serve now fails, where a convention-built URL could not see it.
const TS_VARIANT = /^\d{2,4}p\/playlist\.m3u8(\?|$)/; // MPEG-TS: per-rung directory
const CMAF_VARIANT = /^cmaf\/media_\d+\.m3u8(\?|$)/; // CMAF: shared pseudo-rendition
const TS_SEGMENT = /^seg_\d+\.ts(\?|$)/;
const CMAF_SEGMENT = /^chunk-\d+-\d+\.m4s(\?|$)/;

/** Playlist lines that are neither blank nor a #EXT tag — i.e. the URIs. */
function uriLines(playlist: string): string[] {
  return playlist
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/**
 * variantURIs returns the URI advertised by each #EXT-X-STREAM-INF in a master
 * playlist — the next non-blank, non-tag line after each one. Returning them
 * per-STREAM-INF (rather than every URI line) keeps the count meaningful: an
 * empty or truncated master yields none, and the test fails.
 */
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
  expect(detail.hls_url).toMatch(
    new RegExp(`^/api/v1/videos/${videoId}/hls/master\\.m3u8\\?v=`),
  );
  // The ladder rows persisted, and they are real VIDEO rungs. This fixture
  // uploads its OWN 16x16 clip, so it can never pick up audio-only seed data
  // from elsewhere in the suite — but an audio-only CMAF tree deliberately gets
  // no rendition rows at all, so spelling out "positive height and width" says
  // which shape this test depends on instead of leaving it implied.
  expect(detail.renditions?.length ?? 0).toBeGreaterThan(0);
  for (const r of detail.renditions ?? []) {
    expect(r.height).toBeGreaterThan(0);
    expect(r.width).toBeGreaterThan(0);
  }
  const heights = (detail.renditions ?? []).map((r) => r.height);

  // The stored playlist tree round-trips: master → media playlist → segment are
  // all served by the real endpoints (awaited requests, no mocks). Each hop
  // FOLLOWS the URI the previous document advertised, resolved relative to it,
  // so this proves what the origin actually publishes rather than a convention.
  const masterURL = new URL(`${API_URL}${detail.hls_url}`);
  const master = await request.get(masterURL.toString());
  expect(master.status()).toBe(200);
  const masterBody = await master.text();
  expect(masterBody).toContain("#EXTM3U");

  // A broken or empty master yields no variants and fails here. There is at
  // least one variant per ladder rung — CMAF publishes one per (codec, rung)
  // pair, so with HEVC/AV1 on there are more variants than rungs, never fewer.
  const variants = variantURIs(masterBody);
  expect(variants.length).toBeGreaterThanOrEqual(heights.length);
  expect(variants.length).toBeGreaterThan(0);

  // Every variant URI is one of the two packagings the backend supports, and
  // they all agree with each other — a master mixing both would be corrupt.
  const isCMAF = CMAF_VARIANT.test(variants[0]);
  for (const uri of variants) {
    expect(uri, `unrecognised variant URI in master playlist: ${uri}`).toMatch(
      isCMAF ? CMAF_VARIANT : TS_VARIANT,
    );
  }

  // ...and they agree with the packaging format the backend DECLARES on the
  // detail response, so the advertised format cannot drift from the bytes.
  // Tolerated as absent so this still passes against a core predating the field.
  if (detail.packaging_format) {
    expect(detail.packaging_format).toBe(isCMAF ? "cmaf" : "hls-ts");
  }
  // `dash_url` exists only for a CMAF tree — an MPEG-TS tree has no MPD.
  expect(Boolean(detail.dash_url)).toBe(isCMAF);

  const variantURL = new URL(variants[0], masterURL);
  const variant = await request.get(variantURL.toString());
  expect(variant.status()).toBe(200);
  const variantBody = await variant.text();
  expect(variantBody).toContain("#EXTM3U");

  // An fMP4 stream is unplayable without its initialisation segment, so when
  // the media playlist maps one, fetch it too. MPEG-TS playlists have no map.
  const map = /#EXT-X-MAP:URI="([^"]+)"/.exec(variantBody);
  expect(Boolean(map)).toBe(isCMAF);
  if (map) {
    const init = await request.get(new URL(map[1], variantURL).toString());
    expect(init.status()).toBe(200);
  }

  // Segment URIs carry a `?v=` cache-buster (matching the master/variant URLs),
  // e.g. `seg_00000.ts?v=dk5lp39mvmig` or `chunk-0-00001.m4s?v=dk5lp39mvmig` —
  // match the name with an optional query.
  const segment = uriLines(variantBody).find((l) =>
    (isCMAF ? CMAF_SEGMENT : TS_SEGMENT).test(l),
  );
  expect(segment, `no segment URI in media playlist:\n${variantBody}`).toBeTruthy();
  const seg = await request.get(new URL(segment!, variantURL).toString());
  expect(seg.status()).toBe(200);

  // A CMAF tree serves the SAME segments through a DASH manifest as well; that
  // second manifest is the whole point of packaging CMAF, so prove it resolves.
  if (isCMAF) {
    const mpd = await request.get(`${API_URL}${detail.dash_url}`);
    expect(mpd.status()).toBe(200);
    expect(await mpd.text()).toContain("<MPD");
  }

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
