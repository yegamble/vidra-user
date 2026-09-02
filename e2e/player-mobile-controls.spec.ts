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
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
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

    await page.getByRole("button", { name: "Speed: 1×" }).click();
    const menu = page.getByRole("menu", { name: "Playback speed" });
    await expect(menu).toBeVisible();
    const rows = menu.getByRole("menuitemradio");
    await expect(rows).toHaveCount(12);

    // Every rung must be reachable: inside the viewport, and scrollable into
    // view within the menu's own scroll box rather than clipped by an ancestor.
    const offscreen = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]') as HTMLElement;
      const box = m.getBoundingClientRect();
      const bad: string[] = [];
      if (box.top < 0 || box.left < 0 || box.right > window.innerWidth) bad.push("menu box");
      for (const r of Array.from(m.querySelectorAll('[role="menuitemradio"]'))) {
        // Scroll each row into the menu's own viewport, then check the page.
        r.scrollIntoView({ block: "nearest" });
        const b = r.getBoundingClientRect();
        if (b.top < 0 || b.bottom > window.innerHeight || b.width === 0 || b.height === 0) {
          bad.push((r.textContent || "").trim());
        }
      }
      return bad;
    });
    expect(offscreen, "speed options rendered outside the viewport").toEqual([]);

    // And the extremes of the ladder are actually clickable, not just present.
    await rows.filter({ hasText: "4×" }).click();
    await expect(page.getByRole("button", { name: "Speed: 4×" })).toBeVisible();
  });
}

test("the speed menu escapes the player's overflow-hidden stage", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
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
