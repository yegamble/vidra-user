import { expect, test, type Page } from "@playwright/test";

// Up-next queue panel (YouTube-parity up-next). The watch page renders a viewer-
// built playback queue ABOVE the related rail, driven by the cross-tab
// localStorage queue store (key "vidra.playback-queue.v1"). All backend calls are
// route-mocked (no backend in `npm run ci`); the queue is seeded into
// localStorage before the app boots via addInitScript, mirroring the endcard
// spec's session-seeding technique. The queue head also wins over the related
// pick as the end card's "next", so the same fixture proves both.

const QUEUE_KEY = "vidra.playback-queue.v1";

function video(id: string, title: string, channelId = "c1") {
  return {
    id,
    channel_id: channelId,
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
    channel_handle: `h-${channelId}`,
    channel_display_name: `Channel ${channelId}`,
  };
}

// Mocks a watch page for v1. The related rail resolves to a DIFFERENT video (vR)
// so tests can prove the seeded queue head (v2) wins as the end card's "next".
async function mockWatchPages(page: Page) {
  await page.route(/\/api\/v1\/videos\/v1$/, (route) =>
    route.fulfill({ json: video("v1", "Now Playing") }),
  );
  await page.route(/\/api\/v1\/videos\/v2$/, (route) =>
    route.fulfill({ json: video("v2", "Queue Head Two") }),
  );
  await page.route(/\/api\/v1\/videos\/v3$/, (route) =>
    route.fulfill({ json: video("v3", "Queued Three") }),
  );
  // Recommendations empty → the rail falls back to the same-channel listing.
  await page.route(/\/api\/v1\/videos\/[^/]+\/recommendations/, (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route(/\/api\/v1\/channels\/h-c1\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [video("vR", "Related Pick")] } }),
  );
  // Id-agnostic subresource stubs.
  await page.route(/\/api\/v1\/videos\/[^/]+\/original/, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/[^/]+\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/[^/]+\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/[^/]+\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
}

async function seedQueue(page: Page, items: unknown[]) {
  await page.addInitScript(
    ([key, val]) => window.localStorage.setItem(key, val),
    [QUEUE_KEY, JSON.stringify(items)] as const,
  );
}

const SEED = [video("v2", "Queue Head Two"), video("v3", "Queued Three")];

test("the up-next panel lists the seeded queue and links to each video", async ({ page }) => {
  await seedQueue(page, SEED);
  await mockWatchPages(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Now Playing" })).toBeVisible();

  const panel = page.getByTestId("upnext-queue");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("upnext-row")).toHaveCount(2);
  await expect(panel.getByRole("link", { name: "Queue Head Two" })).toHaveAttribute(
    "href",
    "/videos/v2",
  );
  await expect(panel.getByRole("link", { name: "Queued Three" })).toHaveAttribute(
    "href",
    "/videos/v3",
  );
});

test("removing a row drops it from the panel", async ({ page }) => {
  await seedQueue(page, SEED);
  await mockWatchPages(page);
  await page.goto("/videos/v1");

  const panel = page.getByTestId("upnext-queue");
  await expect(panel.getByTestId("upnext-row")).toHaveCount(2);
  await panel.getByRole("button", { name: "Remove Queue Head Two from the queue" }).click();
  await expect(panel.getByTestId("upnext-row")).toHaveCount(1);
  await expect(panel.getByRole("link", { name: "Queue Head Two" })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Queued Three" })).toBeVisible();
});

test("Clear all empties the panel entirely", async ({ page }) => {
  await seedQueue(page, SEED);
  await mockWatchPages(page);
  await page.goto("/videos/v1");

  const panel = page.getByTestId("upnext-queue");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByTestId("upnext-queue")).toHaveCount(0);
});

test("the end card's next video is the queue head, not the related pick", async ({ page }) => {
  await seedQueue(page, SEED);
  await mockWatchPages(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Now Playing" })).toBeVisible();
  // Wait for the queue to hydrate before ending playback.
  await expect(page.getByTestId("upnext-queue")).toBeVisible();

  await page
    .locator("video")
    .first()
    .evaluate((el: HTMLVideoElement) => el.dispatchEvent(new Event("ended")));

  const card = page.getByTestId("player-end-card");
  await expect(card).toBeVisible();
  // The queued head wins over the related pick as "next".
  await expect(card.getByText("Queue Head Two")).toBeVisible();
  await expect(card.getByText("Related Pick")).toHaveCount(0);
});
