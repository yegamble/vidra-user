import { expect, test, type Page } from "@playwright/test";

import { API_URL, TINY_PNG_BASE64, uniqueId } from "./fixtures";

// The backport-W0.2 redesign moved Playlists off the primary sidebar; it is now
// reached from the Library hub. Navigate Library → Playlists with client-side
// clicks so the in-memory session survives.
async function openPlaylists(page: Page) {
  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("link", { name: "Playlists" }).click();
}

// Regression lock for the playlist-cover flow a demo build flagged as 404ing.
// The current code works; this proves the whole round trip against a real
// vidra-core + PostgreSQL so it can't silently regress:
//   1. a creator uploads a cover on the playlist detail page,
//   2. a FRESH refetch of the detail page (client-side away-and-back, so the
//      owner cover editor re-reads has_thumbnail from the backend) still shows
//      the cover — proving has_thumbnail round-tripped true,
//   3. the API confirms persistence: GET /playlists/:id/thumbnail returns 200
//      with an image content-type (NOT a 404), and GET /playlists/:id carries
//      has_thumbnail=true on a fresh, unauthenticated public read.
//
// This is the dedicated, named counterpart to channel-banner.spec.ts; the cover
// upload is also exercised inside playlists.spec.ts, but this spec adds the
// has_thumbnail-after-refetch evidence so a cover-only 404 regression fails here.
test("a playlist cover uploaded on the detail page survives a refetch (no 404)", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const title = `Cover Mix ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-cover-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Create a PUBLIC playlist so its cover is readable via the public API.
  await openPlaylists(page);
  await page.getByLabel("Playlist title").fill(title);
  await page.getByLabel("Visibility").selectOption("public");
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/playlists$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  // Scope to the page content: the global header also carries a "Create" menu
  // button, so an unscoped getByRole would be a strict-mode violation.
  await page.locator("#main-content").getByRole("button", { name: "Create" }).click();
  await created;

  // Open the detail page and upload a PNG cover from the owner cover manager.
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const uploaded = page.waitForResponse(
    (r) =>
      /\/api\/v1\/playlists\/[^/]+\/thumbnail$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Cover image").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await uploaded;
  await expect(page.getByRole("img", { name: "Current cover" })).toBeVisible();

  const playlistId = page.url().split("/playlists/")[1];

  // Refetch via client-side nav (keeps the in-memory session so the owner cover
  // editor stays mounted). The cover editor seeds `shown` from the FRESH detail
  // fetch's has_thumbnail, so a re-rendered "Current cover" image proves the flag
  // round-tripped true — not just optimistic local state after the upload.
  await openPlaylists(page);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("img", { name: "Current cover" })).toBeVisible();

  // DB evidence via the API: the public thumbnail endpoint serves the stored
  // cover (200 image/*, NOT a 404), and the public playlist detail carries
  // has_thumbnail=true on a fresh, unauthenticated read.
  const thumb = await request.get(`${API_URL}/api/v1/playlists/${playlistId}/thumbnail`);
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["content-type"]).toContain("image/");

  const detail = await request.get(`${API_URL}/api/v1/playlists/${playlistId}`);
  expect(detail.status()).toBe(200);
  expect(await detail.json()).toMatchObject({ has_thumbnail: true });
});
