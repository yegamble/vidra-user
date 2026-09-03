import { expect, test, type Page } from "@playwright/test";

// PLAY-MOBILE: the player's option menus must be fully reachable on a phone.
//
// The player stage is `overflow-hidden` and, at a phone width, only ~185px tall
// (16:9 of a ~328px column). The speed/quality menus used to render `absolute`
// INSIDE that stage, so a 12-rung speed ladder was clipped by the video's own
// top edge — measured on a 360x740 viewport, the menu's top was -48px and 7 of
// the 12 rungs (0.25x-1x and 3x-4x) fell outside the stage entirely and could
// not be tapped. jsdom has no layout, so only a real browser can catch this.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

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
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) =>
    route.fulfill({
      json: {
        captions: [{ language: "en", label: "English", created_at: new Date().toISOString() }],
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/captions\/en$/, (route) =>
    route.fulfill({ contentType: "text/vtt", body: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n" }),
  );
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

for (const [label, width, height] of [
  ["small Android", 360, 740],
  ["iPhone SE", 375, 667],
] as const) {
  test(`every playback-speed option is on screen at ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockWatchPage(page);
    await page.goto("/videos/v1");
    await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

    // At a phone-width stage the speed ladder lives in the overflow menu.
    await page.getByRole("button", { name: "More player options" }).click();
    const menu = page.getByRole("menu", { name: "More player options" });
    await expect(menu).toBeVisible();
    const rows = menu.getByRole("group", { name: "Playback speed" }).getByRole("menuitemradio");
    await expect(rows).toHaveCount(12);

    const offscreen = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]') as HTMLElement;
      const box = m.getBoundingClientRect();
      const bad: string[] = [];
      if (box.top < 0 || box.left < 0 || box.right > window.innerWidth) bad.push("menu box");
      for (const r of Array.from(m.querySelectorAll('[role="menuitemradio"]'))) {
        r.scrollIntoView({ block: "nearest" });
        const b = r.getBoundingClientRect();
        if (b.top < 0 || b.bottom > window.innerHeight || b.width === 0 || b.height === 0) {
          bad.push((r.textContent || "").trim());
        }
      }
      return bad;
    });
    expect(offscreen, "speed options rendered outside the viewport").toEqual([]);

    // The extremes of the ladder are actually clickable, not merely present.
    await rows.filter({ hasText: "4×" }).click();
    await expect
      .poll(() => page.locator("video").evaluate((el: HTMLVideoElement) => el.playbackRate))
      .toBe(4);
  });
}

test("the player's menus escape the overflow-hidden stage", async ({ page }) => {
  // 900px viewport -> a stage wide enough for the bar's own Speed menu, so this
  // covers BOTH popup paths (PlayerMenu and the overflow menu) in one place.
  await page.setViewportSize({ width: 900, height: 700 });
  await mockWatchPage(page);
  await page.goto("/videos/v1");
  await page.getByRole("button", { name: "Speed: 1×" }).click();
  await expect(page.getByRole("menu", { name: "Playback speed" })).toBeVisible();

  const geo = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="video-player"]')!;
    const menu = document.querySelector('[role="menu"]') as HTMLElement;
    return {
      insideStage: stage.contains(menu),
      position: getComputedStyle(menu).position,
      menuTop: Math.round(menu.getBoundingClientRect().top),
    };
  });
  // Portaled out of the stage and viewport-positioned — the two properties that
  // make clipping structurally impossible rather than accidentally absent.
  expect(geo.insideStage).toBe(false);
  expect(geo.position).toBe("fixed");
  expect(geo.menuTop).toBeGreaterThanOrEqual(0);
});

// The control BAR. Its intrinsic width used to exceed the stage at every width
// below ~1024px, and the surplus was silently eaten by the stage's
// `overflow-hidden` — Fullscreen first, then PiP and Quality. The two
// non-obvious widths are kept deliberately:
//   640px  — the sidebar appears exactly where the old `sm:` breakpoints
//            revealed MORE controls, so the stage NARROWS to ~356px while the
//            bar demands ~200px more. This was the worst case, worse than 320.
//   1024px — the row had zero slack, so an "Auto (1080p)" quality label clipped
//            Fullscreen on a desktop.
// e2e/responsive.spec.ts cannot see any of this: `overflow-hidden` stops the
// overflow ever reaching document.scrollWidth, so it reports a clean viewport
// while five controls are invisible.
for (const [label, width, height] of [
  ["small phone", 320, 640],
  ["phone", 390, 844],
  ["breakpoint edge", 640, 900],
  ["tablet", 768, 1024],
  ["small desktop", 1024, 800],
  ["desktop", 1280, 900],
] as const) {
  test(`no control is clipped out of the player at ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await mockWatchPage(page);
    await page.goto("/videos/v1");
    await expect(page.getByTestId("player-controls")).toBeVisible();

    const report = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="video-player"]')!.getBoundingClientRect();
      const bar = document.querySelector('[data-testid="player-controls"]')!;
      const clipped: string[] = [];
      for (const el of Array.from(bar.querySelectorAll("button, [role=slider]"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // tiered out by design
        if (r.left < stage.left - 0.5 || r.right > stage.right + 0.5) {
          clipped.push(el.getAttribute("aria-label") || (el.textContent || "").trim());
        }
      }
      return { stageWidth: Math.round(stage.width), clipped };
    });
    expect(report.clipped, `controls clipped outside the player stage`).toEqual([]);
  });

  test(`every control stays reachable at ${label} (${width}px)`, async ({ page }) => {
    // Tiering a control out of the bar is only acceptable if it lands in the
    // overflow menu. Assert the union, not the bar.
    await page.setViewportSize({ width, height });
    await mockWatchPage(page);
    await page.goto("/videos/v1");
    await expect(page.getByTestId("player-controls")).toBeVisible();

    const bar = page.getByTestId("player-controls");
    const inBar = async (name: string) =>
      (await bar.getByRole("button", { name, exact: true }).count()) > 0;

    await page.getByRole("button", { name: "More player options" }).click();
    const menu = page.getByRole("menu", { name: "More player options" });
    await expect(menu).toBeVisible();

    for (const name of ["Mute", "Captions", "Autoplay next", "Theater mode"]) {
      const reachable =
        (await inBar(name)) ||
        (await inBar("Autoplay next is on")) ||
        (await menu.getByRole("menuitemcheckbox", { name, exact: true }).count()) > 0;
      expect(reachable, `${name} is unreachable at ${width}px`).toBe(true);
    }
    // Speed is a graded choice: reachable either as the bar's menu button or as
    // a radio group in the overflow menu.
    const speedReachable =
      (await bar.getByRole("button", { name: /^Speed:/ }).count()) > 0 ||
      (await menu.getByRole("group", { name: "Playback speed" }).count()) > 0;
    expect(speedReachable, `Speed is unreachable at ${width}px`).toBe(true);

    // Fullscreen is never tiered out — it is the control the old bar clipped.
    await expect(bar.getByRole("button", { name: "Fullscreen" })).toBeVisible();
  });
}
