import { expect, test, type Page } from "@playwright/test";

import { uuidToShortId } from "../lib/short-id";

// Short share links, route-mocked (a real backend is not running in `npm run
// ci`). Clipboard read-back needs explicit permissions in Chromium.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

// A REAL uuid: /v/ short ids only exist for uuid video ids, which is what the
// backend issues (the other mocked specs use synthetic ids like "v1").
const VIDEO_ID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";
const SID = uuidToShortId(VIDEO_ID) as string;

const DETAIL = new RegExp(`/api/v1/videos/${VIDEO_ID}$`);
const ORIGINAL = new RegExp(`/api/v1/videos/${VIDEO_ID}/original`);

const detail = {
  id: VIDEO_ID,
  channel_id: "c1",
  title: "Short Link Me",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 3,
  has_thumbnail: false,
};

async function mockWatch(page: Page) {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort()); // don't actually stream bytes
  await page.route(new RegExp(`/api/v1/videos/${VIDEO_ID}/captions$`), (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(new RegExp(`/api/v1/videos/${VIDEO_ID}/comments`), (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(new RegExp(`/api/v1/videos/${VIDEO_ID}/rating`), (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

test("the share dialog offers the short /v/ link, with an optional start time", async ({
  page,
}) => {
  await mockWatch(page);
  await page.goto(`/videos/${VIDEO_ID}`);
  await expect(page.getByRole("heading", { name: "Short Link Me" })).toBeVisible();

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
  await expect(link).toHaveValue(`${origin}/v/${SID}`);

  const copyLink = dialog.getByRole("button", { name: "Copy watch page link" });
  await copyLink.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/v/${SID}`);

  // "Start at" appends ?t=<seconds> to the short link too.
  await dialog.getByRole("checkbox", { name: "Start at 1:35" }).check();
  await expect(link).toHaveValue(`${origin}/v/${SID}?t=95`);

  // The embed snippet keeps the plain video id (the embed route is not aliased).
  await expect(dialog.getByLabel("Embed code", { exact: true })).toHaveValue(
    new RegExp(`src="${origin}/embed/${VIDEO_ID}\\?t=95"`),
  );
});

test("a short link lands on the watch page and STAYS short, query intact", async ({ page }) => {
  await mockWatch(page);
  await page.goto(`/v/${SID}?t=90`);

  // /v/ still 301s to the canonical /videos/{uuid} route — that is what renders,
  // and the stream assertion below is what proves it — but the watch page then
  // rewrites the address bar back to the short alias, so a viewer never sees a
  // raw UUID and what they copy out of the bar is the shareable link.
  await expect(page).toHaveURL(new RegExp(`/v/${SID}\\?t=90$`));
  await expect(page.getByRole("heading", { name: "Short Link Me" })).toBeVisible();
  // The preserved ?t= still rides the stream src as a native media fragment.
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    new RegExp(`/api/v1/videos/${VIDEO_ID}/original#t=90$`),
  );
});

test("a legacy /videos/watch/ link redirects to the canonical watch page, query intact", async ({
  page,
}) => {
  await mockWatch(page);
  // The format vidra-core federation and its Bluesky auto-poster minted; this
  // app never routed it, so it 404s without the next.config.ts redirect.
  await page.goto(`/videos/watch/${VIDEO_ID}?t=5`);

  // next.config.ts redirects to /videos/{uuid}, which then shows the short alias.
  await expect(page).toHaveURL(new RegExp(`/v/${SID}\\?t=5$`));
  await expect(page.getByRole("heading", { name: "Short Link Me" })).toBeVisible();
});

test("an unresolvable short link 404s instead of redirecting", async ({ page }) => {
  const response = await page.goto("/v/not-a-valid-sid");
  expect(response?.status()).toBe(404);
});
