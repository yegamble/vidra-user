import { expect, test, type APIRequestContext } from "@playwright/test";

import { API_URL, adminToken, seedPublishedChannel, uniqueId, waitForPublished } from "./fixtures";

// Proves the admin featured banner end to end against a real vidra-core +
// PostgreSQL: the deterministic admin enables the banner (with an explicit title
// override) for a seeded public video via the settings API, the home page then
// renders the masthead — carrying its Featured chip + the override title — WITHOUT
// pushing the video grid out of the same viewport (the size budget), and disabling
// it removes the banner again.
//
// The public /instance snapshot the home page reads is data-cached for ~60s, so a
// settings change can take up to a cache TTL to surface. Each visibility assertion
// therefore reloads inside a toPass() poll rather than reading a single (possibly
// stale) render. WRITE-ONLY in this loop (npm run e2e:backed), never part of the
// mocked `npm run ci` gate.

async function setFeatured(
  request: APIRequestContext,
  token: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await request.patch(`${API_URL}/api/v1/admin/instance-settings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: patch,
  });
  expect(res.ok(), `PATCH instance-settings ${res.status()}`).toBeTruthy();
}

test("admin featured banner shows on home within the size budget, then disappears when disabled", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  const { videoId } = await seedPublishedChannel(request);
  // The banner's server-side gate only renders a PUBLISHED video, and the home
  // page data-caches its video read for ~60s. Enabling the banner while the
  // upload is still in the shared transcode queue lets a "not published yet"
  // read get cached and outlive the 90s banner poll below — so wait for the
  // video to actually be live BEFORE turning the banner on.
  await waitForPublished(request, videoId);
  const token = await adminToken(request);
  const bannerTitle = `Featured ${uniqueId()}`;

  // Enable the banner with a distinct title override so it is unambiguous vs the
  // grid card (which keeps the video's own title).
  await setFeatured(request, token, {
    featured_enabled: true,
    featured_video_id: videoId,
    featured_title: bannerTitle,
    featured_label: "featured",
  });

  const banner = page.getByTestId("featured-banner");

  // Ride out the ≤60s instance-config cache: reload until the banner appears.
  await expect(async () => {
    await page.goto("/");
    await expect(banner).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });

  // The banner carries a visible Featured chip and the override title.
  await expect(banner.getByText("Featured")).toBeVisible();
  await expect(banner.getByRole("heading", { name: bannerTitle })).toBeVisible();

  // Size budget: a grid card (VideoCard titles are <h3>; the banner title is <h2>,
  // and a fresh admin has no shelves) is visible in the SAME viewport — the
  // masthead did not shove the grid off-screen.
  const firstGridCard = page.getByRole("heading", { level: 3 }).first();
  await expect(firstGridCard).toBeVisible();
  const box = await firstGridCard.boundingBox();
  const viewport = page.viewportSize();
  expect(box, "grid card has a bounding box").not.toBeNull();
  expect(viewport, "viewport size known").not.toBeNull();
  expect(box!.y).toBeLessThan(viewport!.height);

  // Disable → the banner is gone (again allowing for the cache TTL).
  await setFeatured(request, token, { featured_enabled: false });
  await expect(async () => {
    await page.goto("/");
    await expect(banner).toHaveCount(0, { timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
});
