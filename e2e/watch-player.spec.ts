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

test("the speed selector applies the chosen rate to the player", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  const button = page.getByRole("button", { name: "Speed: Normal" });
  await button.click();
  const menu = page.getByRole("menu", { name: "Playback speed" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: "Normal" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitemradio", { name: "1.5×" }).click();

  await expect(page.getByRole("button", { name: "Speed: 1.5×" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Playback speed" })).toHaveCount(0);
  await expect
    .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
    .toBe(1.5);
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

test("the keyboard shortcuts are documented in an accessible disclosure", async ({ page }) => {
  await mockWatchPage(page);
  await page.goto("/videos/v1");

  const help = page.getByRole("button", { name: "Keyboard shortcuts" });
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  const region = page.getByRole("region", { name: "Keyboard shortcuts" });
  await expect(region).toBeVisible();
  await expect(region.getByText("Play or pause")).toBeVisible();
  await expect(region.getByText("Toggle captions")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(region).toHaveCount(0);
  await expect(help).toBeFocused();
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
  await page.route(FEED, (route) => {
    const url = new URL(route.request().url());
    const videos =
      url.searchParams.get("category") === "7"
        ? // Category feed: a same-category stranger + the current video itself.
          [video("v9", "Same Category Pick", "c9", "7"), video("v1", "Watch Me", "c1", "7")]
        : // Recent feed: a same-channel video, the current video, an unrelated one.
          [
            video("v2", "Same Channel Follow-up", "c1"),
            video("v1", "Watch Me", "c1", "7"),
            video("v3", "Unrelated Clip", "c3"),
          ];
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
