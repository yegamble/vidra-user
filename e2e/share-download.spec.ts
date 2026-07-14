import { expect, test, type Page } from "@playwright/test";

// Share/download dialog coverage, route-mocked (a real backend is not running
// in `npm run ci`). Clipboard read-back needs explicit permissions in Chromium.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;

const detail = {
  id: "v1",
  channel_id: "c1",
  title: "Share Me",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 7,
  has_thumbnail: false,
};

async function openWatch(page: Page, path = "/videos/v1") {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort()); // don't actually stream bytes
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Share Me" })).toBeVisible();
}

test("the share dialog copies the watch link, with an optional start time", async ({ page }) => {
  await openWatch(page);

  // Pretend playback is at 1:35 (no real media streams in mocked runs, so the
  // element's currentTime getter is shadowed on the instance).
  await page.evaluate(() => {
    const v = document.querySelector("video");
    if (v) Object.defineProperty(v, "currentTime", { get: () => 95 });
  });

  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share this video" });
  await expect(dialog).toBeVisible();

  const origin = await page.evaluate(() => window.location.origin);
  const link = dialog.getByLabel("Watch page link", { exact: true });
  await expect(link).toHaveValue(`${origin}/videos/v1`);

  const copyLink = dialog.getByRole("button", { name: "Copy watch page link" });
  await copyLink.click();
  await expect(copyLink).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/videos/v1`);

  // "Start at" appends ?t=<seconds> from the snapshotted playback position
  // (and resets the stale Copied confirmation).
  await dialog.getByRole("checkbox", { name: "Start at 1:35" }).check();
  await expect(copyLink).toHaveText("Copy");
  await expect(link).toHaveValue(`${origin}/videos/v1?t=95`);
  await copyLink.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${origin}/videos/v1?t=95`,
  );
});

test("the share dialog copies an embed iframe snippet and closes on Escape", async ({ page }) => {
  await openWatch(page);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share this video" });
  await expect(dialog).toBeVisible();

  const origin = await page.evaluate(() => window.location.origin);
  const snippet = `<iframe src="${origin}/embed/v1" width="560" height="315" frameborder="0" allowfullscreen title="Share Me"></iframe>`;
  await expect(dialog.getByLabel("Embed code", { exact: true })).toHaveValue(snippet);

  await dialog.getByRole("button", { name: "Copy embed code" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(snippet);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the watch page honors ?t= by starting playback at that position", async ({ page }) => {
  await openWatch(page, "/videos/v1?t=90");
  // The start position rides the stream src as a native media fragment.
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    /\/api\/v1\/videos\/v1\/original#t=90$/,
  );
});

test("the embed player honors ?t=", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.goto("/embed/v1?t=45");
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    /\/api\/v1\/videos\/v1\/original#t=45$/,
  );
});

// The reworked DownloadButton (video thumbnail actions menu) renders only when
// the instance downloads feature is on, and opens a format-picker dialog fed by
// GET /videos/{id}/download; the chosen file is fetched with the bearer token
// (no plain <a href> anymore).
test("the download dialog offers the original file and fetches it", async ({ page }) => {
  await page.route(/\/api\/v1\/instance$/, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        description: "",
        registration_enabled: false,
        features: { uploads: true, imports: true, live: false, comments: true, downloads: true },
      },
    }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/download$/, (route) =>
    route.fulfill({
      json: {
        files: [
          {
            kind: "original",
            url: "/api/v1/videos/v1/download/original",
            filename: "source.mp4",
            content_type: "video/mp4",
            size_bytes: 1_000_000,
            original_name: "camera-source.mp4",
          },
        ],
      },
    }),
  );
  let fetchedOriginal = false;
  await page.route(/\/api\/v1\/videos\/v1\/download\/original$/, (route) => {
    fetchedOriginal = true;
    return route.fulfill({ body: "bytes", contentType: "video/mp4" });
  });

  await openWatch(page);
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Download" });
  await expect(dialog).toBeVisible();

  // The original file is listed and preselected (the only video-mode file).
  const original = dialog.getByRole("radio", { name: /Original file/ });
  await expect(original).toBeVisible();
  await expect(original).toBeChecked();

  // Download fetches the chosen attachment through the authenticated helper.
  await dialog.getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => fetchedOriginal).toBe(true);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

// Per-video download policy (config-parity W9): the watch page button follows
// the EFFECTIVE state — instance downloads feature AND the video's own
// download_enabled flag from the detail payload.
test("the download button follows the per-video download_enabled flag", async ({ page }) => {
  const INSTANCE = /\/api\/v1\/instance$/;
  const instanceDoc = {
    name: "Vidra",
    description: "",
    registration_enabled: false,
    features: { uploads: true, imports: true, live: false, comments: true, downloads: true },
  };
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceDoc }));

  // Instance gate on + per-video flag off => no Download button.
  await page.route(DETAIL, (route) =>
    route.fulfill({ json: { ...detail, download_enabled: false } }),
  );
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Share Me" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toHaveCount(0);

  // Same instance, per-video flag on => the button renders.
  await page.route(DETAIL, (route) =>
    route.fulfill({ json: { ...detail, download_enabled: true } }),
  );
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Share Me" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
});
