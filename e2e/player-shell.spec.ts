import { expect, test, type Page } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// The bespoke player shell (W1.U1): the custom overlay controls — play/pause,
// the keyboard-operable seek + volume sliders, mute, captions, and fullscreen
// (on the CONTAINER) — driving the underlying <video> state. All backend calls
// are route-mocked (no backend in `npm run ci`); where real media state matters
// the original stream serves a tiny valid H.264 mp4.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

const DETAIL_JSON = {
  id: "v1",
  channel_id: "c1",
  title: "Shell Clip",
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

async function mockWatch(page: Page, opts: { captions?: boolean } = {}) {
  await page.route(DETAIL, (route) => route.fulfill({ json: DETAIL_JSON }));
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
  );
  await page.route(CAPTIONS, (route) =>
    route.fulfill({
      json: {
        captions: opts.captions
          ? [{ language: "en", label: "English", created_at: new Date().toISOString() }]
          : [],
      },
    }),
  );
  if (opts.captions) {
    await page.route(/\/api\/v1\/videos\/v1\/captions\/en$/, (route) =>
      route.fulfill({
        contentType: "text/vtt",
        body: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello\n",
      }),
    );
  }
  await page.route(COMMENTS, (route) => route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }));
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

test("the native controls are gone and a custom overlay drives play/pause", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Shell Clip" })).toBeVisible();

  // No stock chrome — the <video> carries no `controls` attribute.
  expect(await page.locator("video").getAttribute("controls")).toBeNull();

  // The custom Play button starts playback (asserted via the play event — the
  // fixture clip is sub-second, so `paused` flips back too fast to poll).
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    (window as unknown as { __played: boolean }).__played = false;
    el.addEventListener("play", () => {
      (window as unknown as { __played: boolean }).__played = true;
    });
  });
  await page.getByRole("button", { name: "Play" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __played: boolean }).__played))
    .toBe(true);
});

test("the mute button toggles video.muted", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  const muted = () => page.locator("video").evaluate((el: HTMLVideoElement) => el.muted);
  expect(await muted()).toBe(false);
  await page.getByRole("button", { name: "Mute" }).click();
  await expect.poll(muted).toBe(true);
  await page.getByRole("button", { name: "Unmute" }).click();
  await expect.poll(muted).toBe(false);
});

test("the captions button toggles the track mode and reflects aria-pressed", async ({ page }) => {
  await mockWatch(page, { captions: true });
  await page.goto("/videos/v1");
  await expect(page.locator("video track")).toHaveCount(1);

  const cc = page.getByRole("button", { name: "Captions" });
  await expect(cc).toHaveAttribute("aria-pressed", "false");
  const mode = () =>
    page.locator("video").evaluate((el: HTMLVideoElement) => el.textTracks[0]?.mode ?? "none");
  await cc.click();
  await expect.poll(mode).toBe("showing");
  await expect(cc).toHaveAttribute("aria-pressed", "true");
  await cc.click();
  await expect.poll(mode).toBe("disabled");
  await expect(cc).toHaveAttribute("aria-pressed", "false");
});

test("the seek bar is keyboard operable and drives currentTime", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Shell Clip" })).toBeVisible();

  // Give the element a known duration and record every requested seek (the
  // fixture clip is sub-second, so currentTime snaps back — asserting the seek
  // intent is the honest proof, as in the storyboard spec).
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    Object.defineProperty(el, "duration", { configurable: true, get: () => 120 });
    el.dispatchEvent(new Event("durationchange"));
    const w = window as unknown as { __seeks: number[] };
    w.__seeks = [];
    const proto = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime")!;
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set(v: number) {
        w.__seeks.push(v);
        proto.set!.call(this, v);
      },
    });
  });

  const seek = page.getByRole("slider", { name: "Seek" });
  await expect(seek).toHaveAttribute("aria-valuemax", "120");
  await seek.focus();
  await page.keyboard.press("ArrowRight"); // 0 → 5
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBe(5);
  await page.keyboard.press("End"); // → 120
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBe(120);
  await page.keyboard.press("Home"); // → 0
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBe(0);
});

test("fullscreen targets the player CONTAINER, so the custom chrome survives", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Shell Clip" })).toBeVisible();

  // Record which element requestFullscreen was invoked on (headless can't truly
  // enter fullscreen; we only need the target element identity).
  await page.evaluate(() => {
    const w = window as unknown as { __fsTarget: string | null };
    w.__fsTarget = null;
    Element.prototype.requestFullscreen = function () {
      w.__fsTarget = this.getAttribute("data-testid") ?? this.tagName.toLowerCase();
      return Promise.resolve();
    };
  });
  await page.getByRole("button", { name: "Fullscreen" }).click();
  expect(await page.evaluate(() => (window as unknown as { __fsTarget: string | null }).__fsTarget)).toBe(
    "video-player",
  );
});

test("the overlay controls are reachable by keyboard in order with visible focus", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Shell Clip" })).toBeVisible();

  // From the seek slider, Tab walks through the control cluster in order.
  await page.getByRole("slider", { name: "Seek" }).focus();
  await expect(page.getByRole("slider", { name: "Seek" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Play" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Mute" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("slider", { name: "Volume" })).toBeFocused();
});
