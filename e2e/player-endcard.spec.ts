import { expect, test, type Page } from "@playwright/test";

// Autoplay-next end card (PLAY-08). On `ended` the bespoke player shows an
// end-card overlay in the media zone: the next video (first related entry), an
// 8s countdown with Play now / Cancel, and an "Autoplay next" switch. All backend
// calls are route-mocked (no backend in `npm run ci`); the end is driven by
// dispatching a synthetic `ended` on the <video> (the fixture never has to reach
// the real end of a stream), which fires the shell's ended handler exactly as a
// finished playback would.

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

// Mocks a watch page for v1 whose related rail resolves to a single next video
// (v2), plus a full v2 watch page so the client-side Play-now navigation lands.
async function mockEndCardPages(page: Page) {
  await page.route(/\/api\/v1\/videos\/v1$/, (route) =>
    route.fulfill({ json: video("v1", "Now Playing") }),
  );
  await page.route(/\/api\/v1\/videos\/v2$/, (route) =>
    route.fulfill({ json: video("v2", "Next Up") }),
  );
  // Same-channel listing → the related rail (and thus the end card's "next").
  await page.route(/\/api\/v1\/channels\/h-c1\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [video("v2", "Next Up")] } }),
  );
  // Id-agnostic subresource stubs cover both v1 and v2.
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

async function endPlayback(page: Page) {
  await page
    .locator("video")
    .first()
    .evaluate((el: HTMLVideoElement) => el.dispatchEvent(new Event("ended")));
}

test("the end card surfaces the next video on `ended` and Play now navigates to it", async ({
  page,
}) => {
  await mockEndCardPages(page);
  await page.goto("/videos/v1");
  await expect(page.getByRole("heading", { name: "Now Playing" })).toBeVisible();
  // Wait until the related rail resolves (so the shell has its "next" queued).
  const rail = page.getByRole("complementary", { name: "Related videos" });
  await expect(rail.getByRole("heading", { name: "Next Up" })).toBeVisible();

  await endPlayback(page);

  const card = page.getByTestId("player-end-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("Up next")).toBeVisible();
  await expect(card.getByText("Next Up")).toBeVisible();
  // Play now navigates client-side to the next video's watch page.
  await card.getByRole("button", { name: "Play now" }).click();
  await expect(page).toHaveURL(/\/videos\/v2$/);
  await expect(page.getByRole("heading", { name: "Next Up" })).toBeVisible();
});

test("Cancel halts the countdown and keeps the card without navigating", async ({ page }) => {
  await mockEndCardPages(page);
  await page.goto("/videos/v1");
  const rail = page.getByRole("complementary", { name: "Related videos" });
  await expect(rail.getByRole("heading", { name: "Next Up" })).toBeVisible();

  await endPlayback(page);
  const card = page.getByTestId("player-end-card");
  await expect(card).toBeVisible();
  // A running countdown offers Cancel; pressing it stops the countdown, drops the
  // polite announcement, and swaps in a Replay affordance — the card stays.
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("button", { name: "Replay" })).toBeVisible();
  await expect(card.getByRole("status")).toHaveText("");
  // The countdown no longer navigates (give it a beat to prove it stays put).
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/videos\/v1$/);
  await expect(card).toBeVisible();
});

test("with autoplay off the end card shows no countdown and never auto-navigates", async ({
  page,
}) => {
  // Seed the session preference OFF before the app boots (the interim session
  // store the end card reads until W1.U6's per-user setting lands).
  await page.addInitScript(() => sessionStorage.setItem("vidra.autoplay-next", "0"));
  await mockEndCardPages(page);
  await page.goto("/videos/v1");
  const rail = page.getByRole("complementary", { name: "Related videos" });
  await expect(rail.getByRole("heading", { name: "Next Up" })).toBeVisible();

  await endPlayback(page);
  const card = page.getByTestId("player-end-card");
  await expect(card).toBeVisible();
  // Autoplay-off suppresses the countdown: the switch reads off, there is no
  // Cancel (Replay instead), and no polite countdown announcement.
  await expect(card.getByRole("switch", { name: "Autoplay next" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(card.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Replay" })).toBeVisible();
  await expect(card.getByRole("status")).toHaveText("");
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(/\/videos\/v1$/);
  // The explicit Play now still navigates.
  await card.getByRole("button", { name: "Play now" }).click();
  await expect(page).toHaveURL(/\/videos\/v2$/);
});
