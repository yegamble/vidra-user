import { expect, test, type Page } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// The watch page's ambient glow (components/watch/AmbientGlow.tsx). It shipped
// as a hard-edged grey RECTANGLE because the blur was clipped to its own box
// (`inset-x-0 -inset-y-6 overflow-hidden`), which is also what kept the page
// from scrolling sideways. The fix inverts both: the layer BLEEDS past the
// stage and dissolves under a mask, and `#main-content` absorbs the bleed with
// `overflow-x-clip`.
//
// So the two halves are one spec on purpose — they are the same trade. A future
// edit that re-clips the glow to stop horizontal scroll fails the first
// assertion; one that widens the bleed without a clipping ancestor fails the
// second.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const THUMB = /\/api\/v1\/videos\/v1\/thumbnail/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/h-c1\/videos(\?|$)/;

// A poster with real colour in it: the glow is a wash of the poster's hues, so
// a grey fixture would prove the geometry and hide the effect.
const POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#101018"/>
  <circle cx="300" cy="240" r="260" fill="#ff2d55"/>
  <circle cx="900" cy="200" r="230" fill="#ff9500"/>
  <circle cx="640" cy="560" r="280" fill="#0a84ff"/>
  <circle cx="1080" cy="600" r="200" fill="#30d158"/>
</svg>`;

const DETAIL_JSON = {
  id: "v1",
  channel_id: "c1",
  title: "Ambient Clip",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 3,
  has_thumbnail: true,
  duration_seconds: 120,
  channel_handle: "h-c1",
  channel_display_name: "Channel c1",
};

function relatedVideo(id: string, title: string) {
  return { ...DETAIL_JSON, id, title, has_thumbnail: false, duration_seconds: 90 };
}

async function mockWatch(page: Page) {
  await page.route(DETAIL, (route) => route.fulfill({ json: DETAIL_JSON }));
  await page.route(THUMB, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: POSTER_SVG }),
  );
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
  );
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: { videos: [relatedVideo("v2", "Up Next One"), relatedVideo("v3", "Up Next Two")] },
    }),
  );
}

// The document must never scroll sideways (a 1px rounding tolerance).
// Against `clientWidth`, NOT `window.innerWidth`: innerWidth includes the
// classic scrollbar gutter, so on a scrollbar-rendering Chromium it silently
// tolerates ~15px of real overflow. Same comparison as e2e/responsive.spec.ts.
async function assertNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("the ambient glow bleeds past the stage on every side without scrolling the page", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Ambient Clip" })).toBeVisible();

  const glow = page.getByTestId("ambient-glow");
  const stage = page.getByTestId("video-player");
  const g = await glow.boundingBox();
  const s = await stage.boundingBox();
  expect(g && s).toBeTruthy();

  // Wider AND taller than the stage, and past it on all four sides — the old
  // implementation was exactly the stage's width and a fixed 24px band tall.
  expect(g!.width).toBeGreaterThan(s!.width);
  expect(g!.height).toBeGreaterThan(s!.height);
  expect(g!.x).toBeLessThan(s!.x);
  expect(g!.x + g!.width).toBeGreaterThan(s!.x + s!.width);
  expect(g!.y).toBeLessThan(s!.y);
  expect(g!.y + g!.height).toBeGreaterThan(s!.y + s!.height);
  // Vertically more than sideways, the way light spills off a screen.
  expect(g!.height - s!.height).toBeGreaterThan(g!.width - s!.width);

  // The glow must never clip itself — a clipped blur has a hard edge, which is
  // the whole defect. The bleed is absorbed by #main-content instead.
  await expect(glow).toHaveCSS("overflow-x", "visible");
  await expect(page.locator("#main-content")).toHaveCSS("overflow-x", "clip");

  await assertNoHorizontalScroll(page);

  // Two cross-fading sample canvases carry the live frame wash.
  await expect(glow.locator("canvas")).toHaveCount(2);
});

test("the glow is not painted at all below md, where the stage is full-bleed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Ambient Clip" })).toBeVisible();

  // There is no gutter to glow into on a phone and no room beside the player,
  // so the layer would be all cost: a canvas, an interval and a blurred
  // composite for something nobody can see. It is `hidden md:block`, so the
  // node stays (one class, no branch) but nothing paints.
  const glow = page.getByTestId("ambient-glow");
  await expect(glow).toBeHidden();
  await expect(glow).toHaveCSS("display", "none");
  await assertNoHorizontalScroll(page);
});
