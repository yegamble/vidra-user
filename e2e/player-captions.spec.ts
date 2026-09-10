import { expect, test, type Page } from "@playwright/test";

import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// Caption placement is a GEOMETRY defect, and jsdom has no layout — only a real
// browser can prove it. The reported failure: with the controls up, the caption
// text sat behind the play/volume/time row, because a natively drawn cue is
// positioned against the bottom of the <video> element and knows nothing about
// the chrome the app overlays on top of it.
//
// So these assertions are measurements, not class names: the caption box's
// bottom edge against the control bar's top edge while the chrome is up, and
// against the stage's bottom edge once it hides.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

// One long cue, so it is active from the first frame: the test measures where a
// caption is drawn, and must not also depend on media clock timing.
const VTT = "WEBVTT\n\n00:00:00.000 --> 00:10:00.000\nA caption that must clear the controls\n";

async function mockWatchPage(page: Page) {
  await page.route(DETAIL, (route) =>
    route.fulfill({
      json: {
        id: "v1",
        channel_id: "c1",
        title: "Watch Me",
        description: "",
        privacy: "public",
        state: "published",
        created_at: new Date().toISOString(),
        views: 10,
        has_thumbnail: false,
        channel_handle: "h-c1",
        channel_display_name: "Channel c1",
      },
    }),
  );
  // A real (tiny) H.264 clip: the media element needs metadata before it will
  // run the cue-activation algorithm at all.
  await page.route(ORIGINAL, (route) =>
    route.fulfill({
      contentType: "video/mp4",
      body: Buffer.from(TINY_MP4_BASE64, "base64"),
    }),
  );
  await page.route(CAPTIONS, (route) =>
    route.fulfill({
      json: {
        captions: [
          {
            language: "en",
            label: "English",
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions\/en$/, (route) =>
    route.fulfill({ contentType: "text/vtt", body: VTT }),
  );
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({
      json: { like_count: 0, dislike_count: 0, my_rating: null },
    }),
  );
}

// Two stage widths, because the two insets are different functions of the stage
// and only one of them binds at each width. The lift is the MEASURED control bar
// (which retiers on the PLAYER's own width — mute, speed, quality, theater and
// PiP each join it at a different tier), while the idle inset is 6% of the stage
// HEIGHT with a 24px floor. On a wide desktop stage the 6% wins; at 640px the
// stage is ~200px tall, 6% of it is 12px, and only the floor keeps the caption
// off the bottom edge. 968px is the wide two-column stage; 640px is this
// player's worst viewport (the sidebar makes the stage 356px there).
for (const [label, width, height] of [
  ["a wide desktop stage", 1280, 720],
  ["the 640px worst case", 640, 800],
] as const) {
  test(`the caption box clears the control bar and drops to the title-safe band on ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await mockWatchPage(page);
    await page.goto("/videos/v1");
    await expect(page.locator("video track")).toHaveCount(1);

    // Turn captions on with the C shortcut, not the button: focus inside the
    // control bar pins the chrome visible, and this test needs it to be able to
    // hide. (The shell stamps data-shortcuts once the listener is live — pressing
    // before that is the historical silent-loss flake.)
    await expect(page.getByTestId("video-player")).toHaveAttribute("data-shortcuts", "ready");
    await page.keyboard.press("c");
    await expect(page.getByRole("button", { name: "Captions" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Nudge the clock so the element runs cue activation.
    await page.locator("video").evaluate(async (el: HTMLVideoElement) => {
      el.muted = true;
      if (el.readyState < 1)
        await new Promise((r) => el.addEventListener("loadedmetadata", r, { once: true }));
      el.currentTime = 0.05;
    });

    const cue = page.getByTestId("player-caption-cue");
    const layer = page.getByTestId("player-captions");
    const bar = page.getByTestId("player-controls");
    const stage = page.getByTestId("video-player");
    await expect(cue).toBeVisible();

    // The gradient scrim the bar paints through its top padding is NOT the bar —
    // the controls the caption has to clear start below it.
    const barContentTop = async () => {
      const box = (await bar.boundingBox())!;
      const padTop = await bar.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingTop));
      return box.y + padTop;
    };

    // 1. Chrome up (the player is paused on open, which pins the controls).
    await expect(layer).toHaveAttribute("data-controls", "visible");
    const upCue = (await cue.boundingBox())!;
    const upBarTop = await barContentTop();
    expect(
      upCue.y + upCue.height,
      `caption bottom ${upCue.y + upCue.height} must sit above control-bar top ${upBarTop}`,
    ).toBeLessThanOrEqual(upBarTop);

    // 2. Chrome idle. Drive the shell's playing state from the element's own
    // event rather than real playback: the fixture clip is a fraction of a second
    // long, so actually playing it would end (and re-pin the controls) before the
    // 3s idle timer ever fired. The caption placement under test is a function of
    // that state, not of the media clock.
    await page
      .locator("video")
      .evaluate((el: HTMLVideoElement) => el.dispatchEvent(new Event("play")));
    await expect(layer).toHaveAttribute("data-controls", "hidden", {
      timeout: 8_000,
    });

    const stageBox = (await stage.boundingBox())!;
    const stageBottom = stageBox.y + stageBox.height;
    // The title-safe band: max(6% of stage height, 24px). Polled rather than read
    // once — the drop is a CSS transition on the bar's own token, and polling lets
    // it settle without inventing a sleep.
    const safeInset = Math.max(stageBox.height * 0.06, 24);
    await expect
      .poll(
        async () => {
          const b = (await cue.boundingBox())!;
          return Math.round(stageBottom - (b.y + b.height));
        },
        {
          message: `caption must keep the title-safe band of the ${stageBox.height}px stage`,
        },
      )
      .toBe(Math.round(safeInset));

    // It moved DOWN — it is no longer parked above the (now hidden) bar.
    const downCue = (await cue.boundingBox())!;
    expect(downCue.y).toBeGreaterThan(upCue.y);
  });
}
