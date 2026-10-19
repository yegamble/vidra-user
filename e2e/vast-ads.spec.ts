import { expect, test, type FrameLocator, type Page, type Route } from "@playwright/test";
import { TINY_MP4_BASE64 } from "../e2e-backed/fixtures";

// Real browser/media elements, mocked public config/VAST/beacons. These tests
// exercise placement isolation; browser autoplay refusal has separate unit proof.
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });
type Scope = Page | FrameLocator;
type Placement = "pre" | "mid" | "post";
const clip = (id: string) => ({
  id, channel_id: "c1", title: id === "v1" ? "VAST content" : "Next content",
  description: "", privacy: "public", state: "published", created_at: "2026-01-01T00:00:00Z",
  views: 1, has_thumbnail: false, duration_seconds: 120,
  channel_handle: "vast-channel", channel_display_name: "VAST channel",
});
function vast(origin: string, placement: Placement) {
  const beacon = (event: string) => `${origin}/__vast/beacon/${placement}/${event}`;
  return `<VAST version="3.0"><Ad><InLine><Impression>${beacon("impression")}</Impression>
    <Error>${beacon("error")}?code=[ERRORCODE]</Error><Creatives><Creative><Linear skipoffset="0">
    <Duration>00:00:04</Duration><TrackingEvents>${["start", "firstQuartile", "midpoint", "thirdQuartile", "complete", "skip"]
      .map(event => `<Tracking event="${event}">${beacon(event)}</Tracking>`).join("")}</TrackingEvents>
    <MediaFiles><MediaFile type="video/mp4">${origin}/__vast/media/${placement}.mp4</MediaFile></MediaFiles>
    </Linear></Creative></Creatives></InLine></Ad></VAST>`;
}

async function media(route: Route) {
  const body = Buffer.from(TINY_MP4_BASE64, "base64");
  const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  return route.fulfill({ status: range ? 206 : 200, contentType: "video/mp4",
    headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}) },
    body: body.subarray(start, end + 1) });
}

async function fixture(page: Page, origin: string, enabled: boolean, cooldown = 0) {
  const requests = { tags: [] as string[], beacons: [] as string[], privateHeaders: [] as string[], content: 0, telemetry: 0 };
  await page.context().addCookies([{ name: "vast_private", value: "not-for-ads", url: origin }]);
  await page.addInitScript(() => {
    localStorage.setItem("vidra.position.v1", "60");
    sessionStorage.setItem("vidra.autoplay-next", "0");
  });
  await page.route("**/__vast/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/__vast/host" || path === "/__vast/host-api") return route.fulfill({ contentType: "text/html", body: `
      <script>window.__vastEnded=0;window.__vastReady=0;addEventListener('message',e=>{try{const m=JSON.parse(e.data);
      if(m.method==='peertube::ready'&&m.params===true)window.__vastReady++;
      if(m.method==='peertube::playbackStatusChange'&&m.params==='ended')window.__vastEnded++;}catch{}});</script>
      <iframe title="VAST embed" allow="autoplay" src="/embed/v1?api=1${path.endsWith("-api") ? "&controls=0" : ""}" style="width:960px;height:540px"></iframe>` });
    if (path.startsWith("/__vast/media/")) return media(route);
    const headers = await route.request().allHeaders();
    if (headers.cookie || headers.authorization || headers.referer) requests.privateHeaders.push(path);
    const tag = /^\/__vast\/(pre|mid|post)\.xml$/.exec(path);
    if (tag) {
      requests.tags.push(tag[1]);
      return route.fulfill({ contentType: "application/xml", body: vast(origin, tag[1] as Placement) });
    }
    requests.beacons.push(path.replace("/__vast/beacon/", ""));
    return route.fulfill({ status: 204, body: "" });
  });
  // The mocked Playwright webServer points SSR reads at 127.0.0.1:1. Thus the
  // pending ads provider resolves this browser /instance response, not SSR data.
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/instance") return route.fulfill({ json: {
      name: "Vidra", defaults: { player_autoplay: false }, features: { comments: false, messaging: false },
      ads: { enabled, vast_tag_url: enabled ? `${origin}/__vast/pre.xml` : "",
        midroll_tag_url: enabled ? `${origin}/__vast/mid.xml` : "", midroll_offset_seconds: 1,
        postroll_tag_url: enabled ? `${origin}/__vast/post.xml` : "", midroll_min_duration_seconds: 0, cooldown_seconds: cooldown,
        skip_after_seconds: 1, controls: true, embed_enabled: true, midroll_offset_percent: 0,
        skip_countdown: "Skip in {seconds}…", skip_label: "Skip ad", remaining_message: "This ad will end in {seconds}" },
    } });
    if (/\/auth\/(refresh|me|session)$/.test(path)) return route.fulfill({ status: 401, json: { error: { code: "unauthorized" } } });
    if (/\/videos\/v[12]$/.test(path)) return route.fulfill({ json: clip(path.endsWith("v1") ? "v1" : "v2") });
    if (path.endsWith("/original")) {
      requests.content++;
      return media(route);
    }
    if (path.endsWith("/embed-privacy")) return route.fulfill({ json: { status: "enabled" } });
    if (path.endsWith("/captions")) return route.fulfill({ json: { captions: [] } });
    if (path.endsWith("/rating")) return route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } });
    if (path.endsWith("/comments")) return route.fulfill({ json: { comments: [], total: 0, limit: 20, offset: 0 } });
    if (path.endsWith("/videos")) return route.fulfill({ json: { videos: [clip("v2")], total: 1, limit: 20, offset: 0 } });
    if (/\/(view|playback|watch-progress)$/.test(path) || path.endsWith("/qoe/events")) {
      if (route.request().method() !== "GET") requests.telemetry++;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  return requests;
}

test("an API-only embed becomes ready and opens preroll without a UI click", async ({ page, baseURL }) => {
  const requests = await fixture(page, new URL(baseURL!).origin, true);
  await page.goto("/__vast/host-api");
  const scope = page.frameLocator("iframe");
  const content = scope.getByTestId("video-player").locator(":scope > video");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __vastReady: number }).__vastReady)).toBeGreaterThan(0);
  expect(await content.getAttribute("src")).toBeNull();
  expect(requests.tags).toEqual([]);
  await page.evaluate(() => document.querySelector("iframe")!.contentWindow!.postMessage(
    JSON.stringify({ id: 1, method: "peertube::play" }), "*"));
  const region = scope.getByRole("region", { name: "Advertisement", exact: true });
  await expect(region).toBeVisible(); // no UI click has occurred
  await expect(scope.getByTestId("player-controls")).not.toBeVisible();
  expect(requests.content).toBe(0);
  expect(await content.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  const adPlay = region.getByRole("button", { name: "Play advertisement", exact: true });
  if (await adPlay.isVisible()) await adPlay.click(); // recover if native autoplay was refused
  await expect.poll(() => requests.beacons.includes("pre/start")).toBe(true);
  await region.locator("video").evaluate((el: HTMLVideoElement) => el.pause());
  await expect(adPlay).toBeVisible(); // ad transport stays reachable with embed controls=0
  expect(requests.tags).toEqual(["pre"]);
  expect(requests.privateHeaders).toEqual([]);
  await adPlay.click();
  await expect.poll(() => requests.beacons.includes("pre/complete"), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => requests.content).toBeGreaterThan(0); // native media end releases content
});

test("an ad that actually plays starts cooldown for every break and the next video", async ({ page, baseURL }) => {
  const requests = await fixture(page, new URL(baseURL!).origin, true, 3600);
  await open(page, "watch");
  const content = page.getByTestId("video-player").locator(":scope > video");
  const region = page.getByRole("region", { name: "Advertisement", exact: true });
  await page.getByTestId("player-controls").getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => requests.beacons.includes("pre/start")).toBe(true);
  await region.locator("video").evaluate((el: HTMLVideoElement) => el.pause());
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vidra.vast.last-played"))).not.toBeNull();
  await region.locator("video").evaluate(el => el.dispatchEvent(new Event("ended")));
  await expect.poll(() => content.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  await content.evaluate((el: HTMLVideoElement) => { el.currentTime = 1; el.dispatchEvent(new Event("timeupdate")); });
  await expect(region).toHaveCount(0);
  await content.evaluate((el: HTMLVideoElement) => { el.pause(); el.dispatchEvent(new Event("ended")); });
  const endCard = page.getByTestId("player-end-card");
  await expect(endCard).toBeVisible();
  expect(requests.tags).toEqual(["pre"]); // current video's mid/post were suppressed too
  await endCard.getByRole("button", { name: "Play now", exact: true }).click();
  await expect(page).toHaveURL(/\/videos\/v2$/);
  await expect(page.getByRole("heading", { name: "Next content", exact: true })).toBeVisible();
  const play = page.getByTestId("player-controls").getByRole("button", { name: "Play", exact: true });
  if (await play.isVisible()) await play.click();
  await expect.poll(() => content.evaluate((el: HTMLVideoElement) => el.played.length)).toBeGreaterThan(0);
  await expect.poll(() => content.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  await content.evaluate((el: HTMLVideoElement) => { el.currentTime = 1; el.dispatchEvent(new Event("timeupdate")); });
  await content.evaluate((el: HTMLVideoElement) => { el.pause(); el.dispatchEvent(new Event("ended")); });
  await expect(endCard).toBeVisible();
  await expect(region).toHaveCount(0);
  expect(requests.tags).toEqual(["pre"]);
  expect(requests.privateHeaders).toEqual([]);
});

async function open(page: Page, variant: "watch" | "embed"): Promise<Scope> {
  await page.goto(variant === "watch" ? "/videos/v1" : "/__vast/host");
  const scope = variant === "watch" ? page : page.frameLocator("iframe");
  await expect(scope.getByTestId("video-player")).toBeVisible();
  if (variant === "watch") await expect(page.getByRole("complementary", { name: "Related videos" })
    .getByRole("heading", { name: "Next content" })).toBeVisible();
  return scope;
}

for (const variant of ["watch", "embed"] as const) {
  test(`${variant}: disabled ads make no tag or tracking requests`, async ({ page, baseURL }) => {
    const requests = await fixture(page, new URL(baseURL!).origin, false);
    const scope = await open(page, variant);
    await scope.getByTestId("player-controls").getByRole("button", { name: "Play", exact: true }).click();
    const content = scope.getByTestId("video-player").locator(":scope > video");
    await expect.poll(() => content.evaluate((el: HTMLVideoElement) => el.played.length)).toBeGreaterThan(0);
    expect(requests.content).toBeGreaterThan(0);
    expect(requests.tags).toEqual([]);
    expect(requests.beacons).toEqual([]);
    await expect(scope.getByRole("region", { name: "Advertisement", exact: true })).toHaveCount(0);
  });

  test(`${variant}: three ad breaks isolate content and defer its ended event`, async ({ page, baseURL }) => {
    await page.clock.install();
    const requests = await fixture(page, new URL(baseURL!).origin, true);
    const scope = await open(page, variant);
    const content = scope.getByTestId("video-player").locator(":scope > video");
    const region = scope.getByRole("region", { name: "Advertisement", exact: true });
    await content.evaluate(el => { (el as HTMLElement).dataset.vastIdentity = "content"; });
    const pauseAd = async (placement: Placement) => {
      await expect(region).toBeVisible();
      await expect(region.locator("video")).toHaveAttribute("src", new RegExp(`/__vast/media/${placement}\\.mp4$`));
      await expect.poll(() => requests.beacons.includes(`${placement}/start`)).toBe(true);
      await region.locator("video").evaluate((el: HTMLVideoElement) => el.pause());
      await expect(region.getByRole("button", { name: "Play advertisement", exact: true })).toBeVisible();
    };
    const finishAd = async () => region.locator("video").evaluate(el => el.dispatchEvent(new Event("ended")));
    await scope.getByTestId("player-controls").getByRole("button", { name: "Play", exact: true }).click();
    await pauseAd("pre");
    expect(await content.evaluate((el: HTMLVideoElement) => ({ paused: el.paused, at: el.currentTime })))
      .toEqual({ paused: true, at: 0 });
    expect(requests.content).toBe(0);
    expect(requests.telemetry).toBe(0);
    if (variant === "watch") expect(await page.evaluate(() => localStorage.getItem("vidra.position.v1"))).toBe("60");
    await region.locator("video").evaluate((el: HTMLVideoElement) => {
      el.currentTime = el.duration * 0.8;
      el.dispatchEvent(new Event("timeupdate"));
    });
    await expect.poll(() => ["impression", "firstQuartile", "midpoint", "thirdQuartile"]
      .every(event => requests.beacons.includes(`pre/${event}`))).toBe(true);
    await finishAd();
    await expect.poll(() => requests.beacons.includes("pre/complete")).toBe(true);
    await expect.poll(() => content.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
    if (variant === "watch") await page.evaluate(() => {
      sessionStorage.setItem("vidra.autoplay-next", "1");
      window.dispatchEvent(new Event("vidra:autoplay-next"));
    }); // enable the postroll countdown only after the initial intentional play

    // Trigger the placement using the same content event the real timeline emits.
    await content.evaluate((el: HTMLVideoElement) => {
      localStorage.setItem("vidra.position.v1", "66");
      el.currentTime = 1;
      el.dispatchEvent(new Event("timeupdate"));
    });
    await pauseAd("mid");
    const heldAt = await content.evaluate((el: HTMLVideoElement) => el.currentTime);
    await content.evaluate((el: HTMLVideoElement) => {
      el.currentTime = 3;
      el.dispatchEvent(new Event("seeking"));
      void el.play().catch(() => {});
    });
    await expect.poll(() => content.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
    expect(await content.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(heldAt, 2);
    if (variant === "watch") expect(await page.evaluate(() => localStorage.getItem("vidra.position.v1"))).toBe("66");
    await expect(content).toHaveAttribute("data-vast-identity", "content");
    await region.locator("video").evaluate((el: HTMLVideoElement) => { el.currentTime = 1.1; el.dispatchEvent(new Event("timeupdate")); });
    await region.getByRole("button", { name: "Skip ad", exact: true }).click();
    await expect.poll(() => requests.beacons.includes("mid/skip")).toBe(true);
    await expect.poll(() => content.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);

    await content.evaluate((el: HTMLVideoElement) => { el.pause(); el.dispatchEvent(new Event("ended")); });
    await pauseAd("post");
    await page.clock.fastForward(9000); // past the watch end-card's 8-second autoplay countdown
    if (variant === "watch") {
      await expect(page).toHaveURL(/\/videos\/v1$/);
      await expect(page.getByTestId("player-end-card")).toHaveCount(0);
    } else expect(await page.evaluate(() => (window as unknown as { __vastEnded: number }).__vastEnded)).toBe(0);
    await finishAd();
    await expect.poll(() => requests.beacons.includes("post/complete")).toBe(true);
    if (variant === "watch") await expect(page.getByTestId("player-end-card")).toBeVisible();
    else await expect.poll(() => page.evaluate(() => (window as unknown as { __vastEnded: number }).__vastEnded)).toBe(1);
    expect(requests.tags).toEqual(["pre", "mid", "post"]);
    expect(requests.privateHeaders).toEqual([]);
  });
}
