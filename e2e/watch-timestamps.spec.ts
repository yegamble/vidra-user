import { expect, test, type Page } from "@playwright/test";

// Wave F: clickable (h:)mm:ss timestamps in comment bodies + the watch-page
// description seek the player in place (no navigation) and carry a ?t= href for
// open-in-new-tab; the share dialog can copy an at-time URL; and the PWA manifest
// + icons are served. All backend calls are route-mocked (no backend in CI).
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const CAPTIONS = /\/api\/v1\/videos\/v1\/captions$/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;

function comment(id: string, body: string) {
  return {
    id,
    video_id: "v1",
    body,
    parent_id: null,
    author_id: `author-${id}`,
    author_username: "bob",
    author_display_name: "Bob Jones",
    remote: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function mockWatch(
  page: Page,
  opts: { description?: string; comments?: ReturnType<typeof comment>[] } = {},
) {
  await page.route(DETAIL, (route) =>
    route.fulfill({
      json: {
        id: "v1",
        channel_id: "c1",
        title: "Watch Me",
        description: opts.description ?? "",
        privacy: "public",
        state: "published",
        created_at: new Date().toISOString(),
        views: 3,
        has_thumbnail: false,
      },
    }),
  );
  // Don't stream real bytes; the currentTime setter is shadowed per-test so seeks
  // are recorded deterministically without a media element writing its own.
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(CAPTIONS, (route) => route.fulfill({ json: { captions: [] } }));
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: opts.comments ?? [], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

// Shadow the media element's currentTime so every seek write lands in an array we
// can assert (the mirror of the number-key seek proof in watch-player.spec.ts).
async function recordSeeks(page: Page) {
  await page.locator("video").evaluate((el: HTMLVideoElement) => {
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
}
const lastSeek = (page: Page) =>
  page.evaluate(() => (window as unknown as { __seeks: number[] }).__seeks.at(-1));

test("a comment timestamp seeks the player in place and carries a ?t= href", async ({ page }) => {
  await mockWatch(page, { comments: [comment("k1", "Skip to 0:45 for the reveal")] });
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await recordSeeks(page);

  const link = page.getByRole("link", { name: "0:45" });
  await expect(link).toBeVisible();
  // Open-in-new-tab fallback: the href carries the start position.
  await expect(link).toHaveAttribute("href", "?t=45");

  await link.click();
  // Clicking seeks the player to 45s WITHOUT navigating away.
  await expect.poll(() => lastSeek(page)).toBe(45);
  await expect(page).toHaveURL(/\/videos\/v1$/);
});

test("a description timestamp seeks the player in place", async ({ page }) => {
  await mockWatch(page, { description: "Chapters — deep dive at 1:02:03." });
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  await recordSeeks(page);

  const link = page.getByRole("link", { name: "1:02:03" });
  await expect(link).toHaveAttribute("href", "?t=3723");
  await link.click();
  await expect.poll(() => lastSeek(page)).toBe(3723);
});

test("the share dialog can copy an at-time watch URL", async ({ page }) => {
  await mockWatch(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();

  // Pretend playback is at 1:35 (no real media streams in mocked runs).
  await page.evaluate(() => {
    const v = document.querySelector("video");
    if (v) Object.defineProperty(v, "currentTime", { configurable: true, get: () => 95 });
  });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share this video" });
  await dialog.getByRole("checkbox", { name: "Start at 1:35" }).check();

  const origin = await page.evaluate(() => window.location.origin);
  await expect(dialog.getByLabel("Watch page link", { exact: true })).toHaveValue(
    `${origin}/videos/v1?t=95`,
  );
  await dialog.getByRole("button", { name: "Copy watch page link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${origin}/videos/v1?t=95`,
  );
});

test("the PWA manifest and icons are served for installability", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const doc = await manifest.json();
  expect(doc.name).toBe("Vidra");
  expect(doc.display).toBe("standalone");
  // A maskable icon is what unlocks the "installable" bar (Lighthouse PWA).
  expect(doc.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);

  for (const asset of ["/favicon.ico", "/apple-touch-icon.png", "/icon-192.png"]) {
    const res = await page.request.get(asset);
    expect(res.ok(), `${asset} should be served`).toBeTruthy();
  }
});
