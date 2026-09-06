import { expect, test, type Page } from "@playwright/test";

import {
  API_URL,
  registerUser,
  seedPublishedChannel,
  TINY_MP4_BASE64,
  uniqueId,
} from "./fixtures";

// The backport-W0.2 redesign moved Playlists OFF the primary sidebar: it is now
// reached from the Library hub (nav-links.ts keeps Home/Trending/Subscriptions/
// Library/History/Messages/Studio; the Library page carries the single
// "Playlists" link, and the BottomTabBar groups /playlists under Library). So a
// user reaches /playlists via Library → Playlists. Navigate that way with
// client-side clicks so the in-memory session survives.
async function openPlaylists(page: Page) {
  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("link", { name: "Playlists" }).click();
}

// Proves the playlist round trip against a real vidra-core + PostgreSQL: a viewer
// creates a playlist and adds a video from the watch page, the video then appears
// on the playlist detail page after a fresh refetch, and removing it persists.
// DB evidence (the playlist_items row) is captured separately via psql.
test("create a playlist, add a video from the watch page, then remove it", async ({
  page,
  request,
}) => {
  const { videoTitle } = await seedPublishedChannel(request);

  // A fresh viewer signs up (the session lives in memory).
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Open the seeded video's watch page (client-side nav so the session survives).
  // The home page may render the same video in BOTH the browse grid and the
  // "Trending now" recommendations rail (content-dependent), so take the first
  // matching card — every match links to the same watch page.
  await page.getByRole("heading", { name: videoTitle }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();

  // Create a playlist AND add this video in one go via "Save to playlist".
  await page.getByRole("button", { name: "Save to playlist" }).click();
  await page.getByLabel("New playlist name").fill("My Mix");
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/playlists$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  const added = page.waitForResponse(
    (r) => /\/playlists\/[^/]+\/videos$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  // Scope to the page content: the global header also carries a "Create" menu
  // button, so an unscoped getByRole would be a strict-mode violation.
  await page.locator("#main-content").getByRole("button", { name: "Create" }).click();
  await created;
  await added;

  // The playlist now contains the video (a fresh detail fetch from the backend).
  await openPlaylists(page);
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();

  // A hard reload must restore the owner session before reading a private playlist.
  await page.reload();
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  // Removing it persists: gone after navigating away and back.
  const removed = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: `Remove ${videoTitle} from playlist` }).click();
  await removed;
  await openPlaylists(page);
  await page.getByRole("link", { name: /My Mix/ }).click();
  await expect(page.getByText("This playlist is empty")).toBeVisible();
});

// Proves the playlist edit round trip: an owner renames a playlist and changes
// its visibility, and the change survives a fresh refetch (a real backend GET),
// confirming the PATCH persisted to PostgreSQL.
test("an owner can edit a playlist's title and visibility, and it persists", async ({ page }) => {
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Create a playlist from the /playlists inline form.
  await openPlaylists(page);
  await page.getByLabel("Playlist title").fill(`Mix ${id}`);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/playlists$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  // Scope to the page content: the global header also carries a "Create" menu
  // button, so an unscoped getByRole would be a strict-mode violation.
  await page.locator("#main-content").getByRole("button", { name: "Create" }).click();
  await created;

  await page.getByRole("link", { name: new RegExp(`Mix ${id}`) }).click();
  await expect(page.getByRole("heading", { name: `Mix ${id}` })).toBeVisible();

  // Edit: rename + make public.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Playlist title").fill(`Renamed ${id}`);
  await page.getByLabel("Playlist visibility").selectOption("public");
  const patched = page.waitForResponse(
    (r) => /\/api\/v1\/playlists\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save" }).click();
  await patched;
  await expect(page.getByRole("heading", { name: `Renamed ${id}` })).toBeVisible();

  // Persisted: navigate away and back → a fresh backend detail fetch still shows
  // the new title and visibility.
  await openPlaylists(page);
  await page.getByRole("link", { name: new RegExp(`Renamed ${id}`) }).click();
  await expect(page.getByRole("heading", { name: `Renamed ${id}` })).toBeVisible();
  await expect(page.getByText(/· public/)).toBeVisible();
});

// Proves the playlist REORDER round trip against a real vidra-core + PostgreSQL:
// an owner reorders two items via the UI and the new order survives a fresh
// refetch (a real backend GET) AND a direct API read — confirming PUT
// /playlists/:id/videos rewrote the positions in the DB.
test("an owner can reorder playlist items, and the order persists", async ({ page, request }) => {
  // Seed one channel with two published videos (A, then B).
  const { handle, videoId: aId, videoTitle: aTitle, token: ownerToken } = await seedPublishedChannel(request);
  const auth = { Authorization: `Bearer ${ownerToken}` };
  const bTitle = `Video B ${uniqueId()}`;
  const bCreate = await request.post(`${API_URL}/api/v1/channels/${handle}/videos`, {
    headers: auth,
    data: { title: bTitle, privacy: "public" },
  });
  const bId = ((await bCreate.json()) as { id: string }).id;
  await request.post(`${API_URL}/api/v1/videos/${bId}/file`, {
    headers: auth,
    multipart: {
      file: { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from(TINY_MP4_BASE64, "base64") },
    },
  });

  // A viewer registers via the API, then creates a public playlist and adds A then B.
  const viewer = await registerUser(request, "fan");
  const vAuth = { Authorization: `Bearer ${viewer.token}` };
  const plCreate = await request.post(`${API_URL}/api/v1/playlists`, {
    headers: vAuth,
    data: { title: `Order Mix ${uniqueId()}`, visibility: "public" },
  });
  const plId = ((await plCreate.json()) as { id: string }).id;
  for (const vid of [aId, bId]) {
    await request.post(`${API_URL}/api/v1/playlists/${plId}/videos`, { headers: vAuth, data: { video_id: vid } });
  }

  // Sign in as the viewer through the UI so the browser session owns the playlist.
  await page.goto("/login");
  await page.getByLabel("Email").fill(viewer.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Open the playlist detail via client-side nav (keeps the in-memory session):
  // initial order is [A, B].
  await openPlaylists(page);
  await page.getByRole("link", { name: /Order Mix/ }).click();
  await expect(page.getByRole("heading", { name: aTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: bTitle })).toBeVisible();

  // Move B up → PUT → 204.
  const reordered = page.waitForResponse(
    (r) => /\/playlists\/[^/]+\/videos$/.test(r.url()) && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("button", { name: `Move ${bTitle} up` }).click();
  await reordered;

  // Persisted (DB evidence): a direct backend read shows B before A.
  const detailRes = await request.get(`${API_URL}/api/v1/playlists/${plId}`, { headers: vAuth });
  const detail = (await detailRes.json()) as { videos: { id: string }[] };
  expect(detail.videos.map((v) => v.id)).toEqual([bId, aId]);

  // And a fresh UI refetch reflects it: B is now first, so its Move up is disabled.
  await openPlaylists(page);
  await page.getByRole("link", { name: /Order Mix/ }).click();
  await expect(page.getByRole("button", { name: `Move ${bTitle} up` })).toBeDisabled();

  // Playback follows the saved order across reload and end-card navigation.
  await page.getByRole("heading", { name: bTitle, exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("playlist") === plId);
  await page.reload();
  const player = page.locator("#main-content video").first();
  await player.evaluate(async (video: HTMLVideoElement) => { video.muted = true; await video.play(); });
  const end = page.getByRole("group", { name: "Up next", exact: true });
  await expect(end.getByText(aTitle, { exact: true })).toBeVisible({ timeout: 30_000 });
  await end.getByRole("button", { name: "Play now", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: aTitle, exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("playlist")).toBe(plId);

});

// Proves the playlist COVER round trip against a real vidra-core + PostgreSQL: an
// owner creates a playlist, uploads a decodable PNG cover, and reloads it.
// Public covers permit anonymous reads; private covers remain owner-only.
for (const visibility of ["public", "private"] as const) {
test(`a ${visibility} playlist cover uploaded from the detail page persists`, async ({ page, request }) => {
  const id = uniqueId();
  const title = `Cover Mix ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Exercise owner-only cover bytes as well as anonymous public delivery.
  await openPlaylists(page);
  await page.getByLabel("Playlist title").fill(title);
  await page.getByLabel("Visibility").selectOption(visibility);
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
    (r) => /\/api\/v1\/playlists\/[^/]+\/thumbnail$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("Cover image").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"),
  });
  await uploaded;
  await expect(page.getByRole("img", { name: "Current cover" })).toBeVisible();
  await page.reload();
  await expect.poll(() => page.getByRole("img", { name: "Current cover" })
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // A fresh anonymous read must retain the playlist visibility boundary.
  const playlistId = page.url().split("/playlists/")[1];
  const res = await request.get(`${API_URL}/api/v1/playlists/${playlistId}/thumbnail`);
  expect(res.status()).toBe(visibility === "private" ? 404 : 200);
  if (visibility === "public") expect(res.headers()["content-type"]).toContain("image/png");
});
}
