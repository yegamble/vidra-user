import { expect, test } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";
import { TRANSPORT_AGREES, transportVsElement } from "./player-transport";

// START-ON-OPEN OVER A CLIENT-SIDE NAVIGATION (owner report: "if the video isn't
// autoplaying, the play button shows up as a pause button — this happens when
// clicking into the video but not if I use a link to watch the video").
//
// The asymmetry is ordering. On a direct URL load the instance fetch only starts
// when the watch page mounts, so start-on-open is still false on the player's
// first render and the kick lands on a settled element. Arriving from the feed,
// the same store was primed by the cards a page ago: the preference is true on
// the FIRST render, the kick fires before the engine has attached anything
// (hls.js renders <video> with no src until its dynamic import resolves), and
// the attach that follows aborts it — silently, because the media element load
// algorithm fires abort/emptied/loadstart and NEVER `pause`. The video stays
// stopped under a control that says "Pause".
//
// Its own file, and top-level: Chromium refuses an unattended play by default,
// and a refusal is a different code path (NotAllowedError, no `play` event at
// all) that would hide this bug entirely. Playwright will not scope
// `launchOptions` to a describe (it forces a new worker), so the relaxed policy
// lives here, where it reaches this spec and nothing else in the suite.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

const INSTANCE = /\/api\/v1\/instance$/;
const ME = /\/api\/v1\/(me|auth\/session)(\?|$)/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const DETAIL = /\/api\/v1\/videos\/v1$/;
const SESSION = /\/api\/v1\/videos\/v1\/playback-session$/;
const MASTER = /\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada\/videos(\?|$)/;
const QOE = /\/api\/v1\/qoe\/events$/;

const DETAIL_BODY = {
  id: "v1",
  channel_id: "c1",
  title: "Kick Clip",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 4,
  has_thumbnail: false,
  duration_seconds: 4,
  hls_url: "/api/v1/videos/v1/hls/master.m3u8",
  channel_handle: "ada",
  channel_display_name: "Ada Makes",
};

test("the watch player started from the feed plays, and the transport says so", async ({
  page,
}) => {
  // Slow on purpose: the watch leg would never see this land in time, while the
  // feed leg has had it in hand since the cards rendered. That is the whole bug.
  await page.route(INSTANCE, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { name: "Vidra", defaults: { player_autoplay: true } } });
  });
  await page.route(ME, (route) =>
    route.fulfill({ status: 401, json: { error: "unauthenticated" } }),
  );
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [DETAIL_BODY], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(DETAIL, (route) => route.fulfill({ json: DETAIL_BODY }));
  await page.route(SESSION, (route) =>
    route.fulfill({
      json: {
        session_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        video_id: "v1",
        packaging_format: "hls-ts",
        hls_url: "/api/v1/videos/v1/hls/master.m3u8",
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(QOE, (route) => route.fulfill({ status: 204, body: "" }));
  // The transcoded tree is gone while the row still advertises it (the DB→object
  // drift this beta has actually seen): hls.js gives up on the playlist and the
  // shell re-points the element at the original — an engine RE-ATTACH, which is
  // what aborts the pending play.
  await page.route(MASTER, (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
  );

  // The defaults must LAND before we leave the feed — that priming is what makes
  // the watch player's very first render already know its answer.
  const defaultsLanded = page.waitForResponse(INSTANCE, { timeout: 30_000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kick Clip" })).toBeVisible();
  await defaultsLanded;

  await page.getByRole("link", { name: "Kick Clip" }).first().click();
  await expect(page.getByTestId("video-player")).toBeVisible();

  // It PLAYS. `played` is durable evidence — it survives the clip ending, so this
  // cannot pass or fail on where the 4s fixture happens to be at sample time.
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .evaluate((el: HTMLVideoElement) => el.played.length > 0 || el.currentTime > 0),
      { timeout: 20_000 },
    )
    .toBe(true);

  // ...and whatever the element ends up doing, the control says the same thing.
  await expect.poll(() => transportVsElement(page)).toMatch(TRANSPORT_AGREES);
});
