import { expect, test, type Page } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// W1.U3 — theater mode (PLAY-04) + Picture-in-Picture (PLAY-05) on the bespoke
// shell. All backend calls are route-mocked (no backend in `npm run ci`).
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
// The related rail lists the owning channel's videos (detail carries channel_handle).
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/h-c1\/videos(\?|$)/;

const DETAIL_JSON = {
  id: "v1",
  channel_id: "c1",
  title: "Theater Clip",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 3,
  has_thumbnail: false,
  duration_seconds: 120,
  channel_handle: "h-c1",
  channel_display_name: "Channel c1",
};

function relatedVideo(id: string, title: string) {
  return {
    id,
    channel_id: "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 5,
    has_thumbnail: false,
    duration_seconds: 90,
    channel_handle: "h-c1",
    channel_display_name: "Channel c1",
  };
}

async function mockWatch(page: Page) {
  await page.route(DETAIL, (route) => route.fulfill({ json: DETAIL_JSON }));
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
  );
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) => route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }));
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  // Related rail so the theater reflow can be asserted against a real element.
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: { videos: [relatedVideo("v2", "Up Next One"), relatedVideo("v3", "Up Next Two")] },
    }),
  );
}

test("theater mode widens the stage and reflows the related rail below, persisting across a reload", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();

  const rail = page.getByRole("complementary", { name: "Related videos" });
  await expect(rail).toBeVisible();
  const player = page.getByTestId("video-player");
  const layout = page.locator("[data-theater]").first();

  // Default: not theater. At the desktop viewport the rail sits BESIDE the player
  // (its top is within the player's vertical band, not stacked below it).
  await expect(layout).toHaveAttribute("data-theater", "off");
  const before = { player: await player.boundingBox(), rail: await rail.boundingBox() };
  expect(before.player && before.rail).toBeTruthy();
  expect(before.rail!.y).toBeLessThan(before.player!.y + before.player!.height);
  // Beside → the rail starts to the right of the player's right edge.
  expect(before.rail!.x).toBeGreaterThan(before.player!.x + before.player!.width - 2);

  // Toggle theater on: the layout flips and the rail drops below the stage.
  const toggle = page.getByRole("button", { name: "Theater mode" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(layout).toHaveAttribute("data-theater", "on");

  const after = { player: await player.boundingBox(), rail: await rail.boundingBox() };
  // The stage widened (no fixed 344px rail eating the right column).
  expect(after.player!.width).toBeGreaterThan(before.player!.width);
  // The rail now sits below the player (its top is past the player's bottom).
  expect(after.rail!.y).toBeGreaterThanOrEqual(after.player!.y + after.player!.height);

  // Session-persisted: a reload in the same tab keeps theater mode.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();
  await expect(page.locator("[data-theater]").first()).toHaveAttribute("data-theater", "on");
  await expect(page.getByRole("button", { name: "Theater mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the PiP button is hidden when the browser reports no Picture-in-Picture support", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, "pictureInPictureEnabled", {
      configurable: true,
      get: () => false,
    });
  });
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();
  await expect(page.getByRole("button", { name: /picture-in-picture/i })).toHaveCount(0);
});

test("the PiP button shows when supported, enters PiP, and mirrors the element events", async ({
  page,
}) => {
  // Force PiP capability deterministically (headless Chromium may report it off)
  // and stub the request so headless can 'enter' without a real PiP window.
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, "pictureInPictureEnabled", {
      configurable: true,
      get: () => true,
    });
    const w = window as unknown as { __pip: { entered: boolean } };
    w.__pip = { entered: false };
    HTMLVideoElement.prototype.requestPictureInPicture = function () {
      w.__pip.entered = true;
      this.dispatchEvent(new Event("enterpictureinpicture"));
      return Promise.resolve({} as PictureInPictureWindow);
    };
  });
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();

  const pip = page.getByRole("button", { name: "Picture-in-picture" });
  await expect(pip).toBeVisible();
  await expect(pip).toHaveAttribute("aria-pressed", "false");

  await pip.click();
  expect(await page.evaluate(() => (window as unknown as { __pip: { entered: boolean } }).__pip.entered)).toBe(
    true,
  );
  // The element's enterpictureinpicture event flips the button state + label.
  await expect(page.getByRole("button", { name: "Exit picture-in-picture" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A leave from the browser UI returns the button.
  await page.locator("video").evaluate((el) => el.dispatchEvent(new Event("leavepictureinpicture")));
  await expect(page.getByRole("button", { name: "Picture-in-picture" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
