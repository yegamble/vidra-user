import { expect, test, type Page } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// Watch-page player polish: playback-speed selector, keyboard shortcuts (with
// the typing guard), captions toggle, and the related-videos rail. All backend
// calls are route-mocked (no backend in `npm run ci`). Where real playback
// state matters the original stream serves a tiny valid H.264 mp4.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const FEED = /\/api\/v1\/videos(\?|$)/;

function video(id: string, title: string, channelId = "c1", category?: string) {
  return {
    id,
    channel_id: channelId,
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
    channel_handle: `h-${channelId}`,
    channel_display_name: `Channel ${channelId}`,
    ...(category ? { category } : {}),
  };
}

async function mockWatchPage(page: Page, opts: { realVideo?: boolean; captions?: boolean } = {}) {
  await page.route(DETAIL, (route) => route.fulfill({ json: video("v1", "Watch Me") }));
  if (opts.realVideo) {
    await page.route(ORIGINAL, (route) =>
      route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
    );
  } else {
    await page.route(ORIGINAL, (route) => route.abort());
  }
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

test("the speed selector offers the full 0.25×–4× ladder and applies the chosen rate", async ({
  page,
}) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  // Normal speed reads "1×" on the button (PLAY-03 — not the old "Normal").
  const button = page.getByRole("button", { name: "Speed: 1×" });
  await button.click();
  const menu = page.getByRole("menu", { name: "Playback speed" });
  await expect(menu).toBeVisible();
  // The full mined ladder: 12 rungs, 1× currently checked, 4× at the bottom.
  await expect(menu.getByRole("menuitemradio")).toHaveCount(12);
  await expect(menu.getByRole("menuitemradio", { name: "1×" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitemradio", { name: "4×" }).click();

  await expect(page.getByRole("button", { name: "Speed: 4×" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Playback speed" })).toHaveCount(0);
  await expect
    .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
    .toBe(4);
  // The choice is remembered for the browsing session (stop-gap until W1.U6).
  expect(await page.evaluate(() => sessionStorage.getItem("vidra.player.speed"))).toBe("4");
});

test("keyboard shortcuts toggle mute and start playback", async ({ page }) => {
  await mockWatchPage(page, { realVideo: true });
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  const muted = () => page.locator("video").evaluate((el: HTMLVideoElement) => el.muted);
  expect(await muted()).toBe(false);
  await page.keyboard.press("m");
  await expect.poll(muted).toBe(true);

  // K starts playback (asserted via the play event — the fixture clip is
  // sub-second, so `paused` flips back too fast to assert reliably).
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    (window as unknown as { __played: boolean }).__played = false;
    el.addEventListener("play", () => {
      (window as unknown as { __played: boolean }).__played = true;
    });
  });
  await page.keyboard.press("k");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __played: boolean }).__played))
    .toBe(true);

  await page.keyboard.press("m");
  await expect.poll(muted).toBe(false);
});

test("C toggles captions on and off", async ({ page }) => {
  await mockWatchPage(page, { captions: true });
  await page.goto("/videos/v1");
  await expect(page.locator("video track")).toHaveCount(1);

  const mode = () =>
    page.locator("video").evaluate((el: HTMLVideoElement) => el.textTracks[0]?.mode ?? "none");
  await page.keyboard.press("c");
  await expect.poll(mode).toBe("showing");
  await page.keyboard.press("c");
  await expect.poll(mode).toBe("disabled");
});

test("shortcuts are ignored while typing in a field", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  const search = page.getByLabel("Search videos");
  await search.click();
  await search.pressSequentially("mkc");
  await expect(search).toHaveValue("mkc");
  expect(await page.locator("video").evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);
});

test("the T shortcut toggles theater mode from anywhere on the watch page", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  const stage = page.locator("[data-theater]").first();
  await expect(stage).toHaveAttribute("data-theater", "off");
  await page.keyboard.press("t");
  await expect(stage).toHaveAttribute("data-theater", "on");
  await page.keyboard.press("t");
  await expect(stage).toHaveAttribute("data-theater", "off");
});

test("the > shortcut steps the playback speed up the ladder", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("button", { name: "Speed: 1×" })).toBeVisible();

  await page.keyboard.press(">");
  await expect(page.getByRole("button", { name: "Speed: 1.25×" })).toBeVisible();
  await expect
    .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
    .toBe(1.25);
  await page.keyboard.press(">");
  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();
});

test("the number keys seek to deciles (5 jumps to 50%)", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  // Stamp a known duration and record every requested seek WITHOUT writing the
  // media element (the /original stream is aborted, so there is no media whose
  // own seeking/timeupdate could push extra values); the recorded write is the
  // honest, deterministic proof the shortcut computed the right decile.
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    Object.defineProperty(el, "duration", { configurable: true, get: () => 120 });
    el.dispatchEvent(new Event("durationchange"));
    const w = window as unknown as { __seeks: number[] };
    w.__seeks = [];
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get: () => 0,
      set: (v: number) => {
        w.__seeks.push(v);
      },
    });
  });

  await page.keyboard.press("5");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBe(60);
  await page.keyboard.press("0");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1)))
    .toBe(0);
});

test("volume arrows adjust volume only while the player region has focus", async ({ page }) => {
  await mockWatchPage(page, { realVideo: true });
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  const vol = () =>
    page.locator("video").evaluate((el: HTMLVideoElement) => Math.round(el.volume * 100) / 100);
  // Start from a mid level so a step is unambiguous in either direction.
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
    el.volume = 0.6;
  });

  // Focus is NOT inside the player (the document body) → ArrowDown is left to
  // the page (scroll), not the volume. Body is not in the ignore selector, so
  // this isolates the focus scoping (not the typing/interactive-control guard).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("ArrowDown");
  expect(await vol()).toBe(0.6);

  // Focus the seek slider (inside the player region) → ArrowDown steps −5%.
  await page.getByRole("slider", { name: "Seek" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(vol).toBe(0.55);
});

test("the keyboard shortcuts are documented in an accessible disclosure", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");

  const help = page.getByRole("button", { name: "Keyboard shortcuts" });
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  const region = page.getByRole("region", { name: "Keyboard shortcuts" });
  await expect(region).toBeVisible();
  // The panel is the user-facing contract: it lists the full PLAY-09 set.
  await expect(region.getByText("Play or pause")).toBeVisible();
  await expect(region.getByText("Toggle captions")).toBeVisible();
  await expect(region.getByText("Volume up / down")).toBeVisible();
  await expect(region.getByText("Theater mode")).toBeVisible();
  await expect(region.getByText("Picture-in-picture")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
  await expect(help).toBeFocused();
});

const STORYBOARD_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
storyboard.jpg#xywh=0,0,160,90

00:00:02.000 --> 00:00:04.000
storyboard.jpg#xywh=160,0,160,90

00:00:04.000 --> 00:00:06.000
storyboard.jpg#xywh=320,0,160,90
`;

test("the storyboard seek-preview previews a frame on hover and seeks on click", async ({ page }) => {
  // A published video that advertises a storyboard (has_storyboard on the detail).
  await page.route(DETAIL, (route) =>
    route.fulfill({
      json: {
        ...video("v1", "Watch Me"),
        has_storyboard: true,
        duration_seconds: 6,
      },
    }),
  );
  await page.route(ORIGINAL, (route) =>
    route.fulfill({ contentType: "video/mp4", body: Buffer.from(TINY_MP4_BASE64, "base64") }),
  );
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) => route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }));
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/storyboard\.vtt$/, (route) =>
    route.fulfill({ contentType: "text/vtt", body: STORYBOARD_VTT }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/storyboard\.jpg$/, (route) =>
    route.fulfill({ contentType: "image/jpeg", body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }),
  );

  await page.goto("/videos/v1");
  const slider = page.getByRole("slider", { name: "Seek preview" });
  await expect(slider).toBeVisible();

  // Record every requested seek (the fixture clip has a single keyframe, so
  // currentTime snaps back to 0 — asserting the seek intent is the honest proof).
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
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

  // Hovering moves the pointer over the track → a storyboard frame previews from
  // the sprite sheet (rendered as a background image of the sprite URL).
  await slider.hover();
  await expect(slider.locator('div[style*="storyboard.jpg"]')).toBeVisible();

  // Clicking seeks the player to the hovered position (a positive time).
  await slider.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1) ?? -1))
    .toBeGreaterThan(0);
});

test("no storyboard scrubber is shown when the video has none", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Seek preview" })).toHaveCount(0);
});

test("the related rail lists same-channel videos first, then same-category", async ({ page }) => {
  // The current video: channel c1, category "7".
  await page.route(DETAIL, (route) => route.fulfill({ json: video("v1", "Watch Me", "c1", "7") }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) => route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }));
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/videos\/config$/, (route) =>
    route.fulfill({
      json: {
        categories: [{ id: "7", label: "Gaming" }],
        licenses: [],
        languages: [],
        privacies: [],
      },
    }),
  );
  // Same-channel videos now come from the channel's own listing (the detail
  // response carries channel_handle → GET /channels/{handle}/videos).
  await page.route(/\/api\/v1\/channels\/h-c1\/videos$/, (route) =>
    route.fulfill({
      json: {
        videos: [
          video("v2", "Same Channel Follow-up", "c1"),
          video("v1", "Watch Me", "c1", "7"),
        ],
      },
    }),
  );
  await page.route(FEED, (route) => {
    const url = new URL(route.request().url());
    // Category feed (filler): a same-category stranger + the current video itself.
    const videos =
      url.searchParams.get("category") === "7"
        ? [video("v9", "Same Category Pick", "c9", "7"), video("v1", "Watch Me", "c1", "7")]
        : [];
    route.fulfill({ json: { videos, sort: "recent", limit: 50, offset: 0 } });
  });

  await page.goto("/videos/v1");
  const rail = page.getByRole("complementary", { name: "Related videos" });
  await expect(rail).toBeVisible();
  const cards = rail.getByRole("heading");
  // Same channel first, then same category; the current video and unrelated
  // videos never appear.
  await expect(cards.nth(0)).toHaveText("Related videos");
  await expect(cards.nth(1)).toHaveText("Same Channel Follow-up");
  await expect(cards.nth(2)).toHaveText("Same Category Pick");
  await expect(rail.getByRole("heading", { name: "Watch Me" })).toHaveCount(0);
  await expect(rail.getByRole("heading", { name: "Unrelated Clip" })).toHaveCount(0);
});
