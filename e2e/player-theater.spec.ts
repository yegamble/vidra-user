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

async function mockWatch(page: Page, videos = [relatedVideo("v2", "Up Next One"), relatedVideo("v3", "Up Next Two")]) {
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
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill({ json: { videos } }));
}


// Theater and PiP tier out of the control bar on a narrow stage. The watch
// page's stage is only ~624px at a 1280 viewport (the left sidebar and the
// 344px related rail take the rest), which cannot hold the full control set —
// so there they live in the Settings menu instead. These specs assert that
// the control WORKS, not where it currently sits, so they stay true at every
// stage width. `stateAttr` differs because a bar control is a toggle button
// (aria-pressed) and a menu row is a menuitemcheckbox (aria-checked).
// `barName` may differ from `menuName`: a bar toggle button renames itself when
// active ("Exit picture-in-picture"), while a menu row keeps a stable name and
// flips aria-checked — which is the correct semantic for a checkbox, not a bug.
async function playerControl(page: Page, menuName: string, barName = menuName) {
  const inBar = page
    .getByTestId("player-controls")
    .getByRole("button", { name: barName, exact: true });
  if ((await inBar.count()) > 0) return { locator: inBar, stateAttr: "aria-pressed" };
  const trigger = page.getByRole("button", { name: "Settings" });
  const menu = page.getByRole("menu", { name: "Settings" });
  if ((await menu.count()) === 0) await trigger.click();
  return {
    locator: menu.getByRole("menuitemcheckbox", { name: menuName, exact: true }),
    stateAttr: "aria-checked",
  };
}

test("theater mode widens the stage and moves the related rail below it, persisting across a reload", async ({
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
  const toggle = await playerControl(page, "Theater mode");
  await expect(toggle.locator).toHaveAttribute(toggle.stateAttr, "false");
  await toggle.locator.click();
  await expect(layout).toHaveAttribute("data-theater", "on");
  // Re-resolve: activating a menu row closes the overflow menu, and theater
  // widens the stage, which can promote the control back into the bar.
  const toggledOn = await playerControl(page, "Theater mode");
  await expect(toggledOn.locator).toHaveAttribute(toggledOn.stateAttr, "true");

  const after = { player: await player.boundingBox(), rail: await rail.boundingBox() };
  // The stage widened (no fixed 344px rail eating the right column).
  expect(after.player!.width).toBeGreaterThan(before.player!.width);
  // The rail now sits below the player (its top is past the player's bottom).
  expect(after.rail!.y).toBeGreaterThanOrEqual(after.player!.y + after.player!.height);

  // FULL-BLEED: the stage spans the whole width of the content area — no
  // max-width measure, no side padding, and no sidebar holding the left edge.
  const main = (await page.locator("#main-content").boundingBox())!;
  expect(Math.abs(after.player!.x - main.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.player!.width - main.width)).toBeLessThanOrEqual(1);
  // The app's primary navigation steps aside in theater (YouTube closes the
  // guide on a theater watch page) — which is what frees that left edge.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);

  // VIEWPORT-CAPPED: the stage never eats the masthead plus the space the page
  // owes the title below it, so the title stays on screen. The lower bound is
  // not decoration — every width/position assertion above is also satisfied by
  // a stage of zero height.
  const viewport = page.viewportSize()!;
  expect(after.player!.height).toBeGreaterThan(300);
  expect(after.player!.height).toBeLessThanOrEqual(viewport.height - 56 - 160);
  const title = (await page.getByRole("heading", { name: "Theater Clip" }).boundingBox())!;
  expect(title.y + title.height).toBeLessThanOrEqual(viewport.height);

  // The page under the band keeps the ordinary two-column layout: the rail is
  // BELOW the stage and BESIDE the title/description column, not stacked under
  // the whole page.
  expect(after.rail!.x).toBeGreaterThan(title.x + title.width - 2);
  expect(Math.abs(after.rail!.y - title.y)).toBeLessThanOrEqual(60);

  // The rail is reachable again from the header's Menu button, which opens it
  // as an overlay drawer over a scrim; Escape closes it.
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  const drawer = page.getByRole("navigation", { name: "Primary" });
  await expect(drawer).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("sidebar-scrim")).toBeVisible();
  // An overlay, not a column: the stage keeps its full-bleed width behind it.
  const stageWithDrawer = (await player.boundingBox())!;
  expect(Math.abs(stageWithDrawer.width - main.width)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId("sidebar-scrim")).toHaveCount(0);

  // Session-persisted: a reload in the same tab keeps theater mode.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();
  await expect(page.locator("[data-theater]").first()).toHaveAttribute("data-theater", "on");
  const afterReload = await playerControl(page, "Theater mode");
  await expect(afterReload.locator).toHaveAttribute(afterReload.stateAttr, "true");
});

test("a page with nothing related lays out exactly like one with a rail", async ({ page }) => {
  // Two regressions in one test.
  //
  // 1. SIZE: a watch page whose related rail resolved EMPTY used to hand the
  //    player column the whole measure — a 720px stage on a 720px screen, with
  //    the title and every action below the fold.
  // 2. SHIFT: sizing the secondary column to its CONTENT meant the same page
  //    painted a narrow stage while the related fetch was in flight and then
  //    jumped to a full-measure one when the list resolved empty — a layout
  //    shift on the largest element on the page. The column's track is now
  //    reserved whether or not anything renders into it (YouTube keeps the
  //    secondary column too), so the stage is the same size throughout.
  await mockWatch(page, []);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();

  const stage = page.getByTestId("video-player");
  // Measured BEFORE the related fetch resolves (the rail is still a skeleton)…
  const whileLoading = (await stage.boundingBox())!;
  await expect(page.getByRole("complementary", { name: "Related videos" })).toHaveCount(0);
  // …and after it resolves to nothing.
  const resolved = (await stage.boundingBox())!;
  expect(Math.abs(resolved.width - whileLoading.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(resolved.x - whileLoading.x)).toBeLessThanOrEqual(1);

  // On screen, with the title under it.
  const viewport = page.viewportSize()!;
  expect(resolved.height).toBeGreaterThan(200);
  expect(resolved.y + resolved.height).toBeLessThan(viewport.height - 100);

  // And the same geometry a page WITH a rail gets — the reserved column is the
  // point, so an empty one changes nothing.
  await page.unroute(CHANNEL_VIDEOS);
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("complementary", { name: "Related videos" })).toBeVisible();
  const withRail = (await stage.boundingBox())!;
  expect(Math.abs(withRail.width - resolved.width)).toBeLessThanOrEqual(1);

  // Still the default layout: the sidebar is present and the stage is not
  // full-bleed (it keeps the page's measure and gutters).
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const main = (await page.locator("#main-content").boundingBox())!;
  expect(withRail.width).toBeLessThan(main.width - 40);
});

test("toggling theater keeps playing the same video — no remount, no second view", async ({
  page,
}) => {
  // The stage used to be rendered at two different tree positions, and React
  // reconciles by position: pressing `T` destroyed the <video>, restarted from
  // 0, re-showed the mid-watch "Resume from…" offer and counted a SECOND view.
  let views = 0;
  await page.route(/\/api\/v1\/videos\/v1\/view$/, (route) => {
    views += 1;
    return route.fulfill({ status: 204, body: "" });
  });
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();

  const media = page.locator("video");
  // Play — which is what counts the view — and stamp the element so a
  // replacement is detectable.
  await media.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true;
    (el as HTMLVideoElement & { __same?: string }).__same = "original-element";
    try {
      await el.play();
    } catch {
      /* autoplay policy — headless allows muted, and the play event is the point */
    }
  });
  await expect.poll(() => views).toBe(1);
  // Let the playhead move off zero. (The route-mocked fixture answers no Range
  // requests, so it cannot be SEEKED — letting it play is how this suite gets a
  // non-zero position to compare against.)
  await expect
    .poll(() => media.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0.3);
  const playedTo = await media.evaluate((el: HTMLVideoElement) => el.currentTime);

  const toggle = await playerControl(page, "Theater mode");
  await toggle.locator.click();
  await expect(page.locator("[data-theater]").first()).toHaveAttribute("data-theater", "on");

  // Same element, same position, and no second view POST.
  expect(
    await media.evaluate(
      (el: HTMLVideoElement) => (el as HTMLVideoElement & { __same?: string }).__same,
    ),
  ).toBe("original-element");
  // Playback carried on from where it was rather than restarting at zero.
  expect(await media.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(
    playedTo,
  );
  expect(await media.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  expect(views).toBe(1);
});

test("theater is inert on a phone, where there is no second column to collapse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Theater Clip" })).toBeVisible();

  const stage = page.getByTestId("video-player");
  const before = (await stage.boundingBox())!;
  const toggle = await playerControl(page, "Theater mode");
  await toggle.locator.click();
  await expect(page.locator("[data-theater]").first()).toHaveAttribute("data-theater", "on");

  // The mode is remembered — it just does not change this layout.
  const after = (await stage.boundingBox())!;
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
  // Not full-bleed: the page's gutter is still there, and the card keeps its
  // radius (a square-cornered edge-to-edge phone player is not an improvement).
  const main = (await page.locator("#main-content").boundingBox())!;
  expect(after.x).toBeGreaterThan(main.x + 8);
  expect(await stage.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).not.toBe("0px");
  // And the phone keeps its navigation (the bottom tab bar), because immersive
  // is gated to the two-column breakpoint too.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("the PiP control is hidden when the browser reports no Picture-in-Picture support", async ({
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Picture-in-picture" })).toHaveCount(0);
});

test("the PiP control shows when supported, enters PiP, and mirrors the element events", async ({
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

  const pip = await playerControl(page, "Picture-in-picture");
  await expect(pip.locator).toBeVisible();
  await expect(pip.locator).toHaveAttribute(pip.stateAttr, "false");

  await pip.locator.click();
  expect(await page.evaluate(() => (window as unknown as { __pip: { entered: boolean } }).__pip.entered)).toBe(
    true,
  );
  // The element's enterpictureinpicture event flips the button state + label.
  const active = await playerControl(page, "Picture-in-picture", "Exit picture-in-picture");
  await expect(active.locator).toHaveAttribute(active.stateAttr, "true");

  // A leave from the browser UI returns the control.
  await page.locator("video").evaluate((el) => el.dispatchEvent(new Event("leavepictureinpicture")));
  const back = await playerControl(page, "Picture-in-picture");
  await expect(back.locator).toHaveAttribute(back.stateAttr, "false");
});
