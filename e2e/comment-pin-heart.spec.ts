import { expect, test, type Page } from "@playwright/test";

// Mocked coverage for the creator pinned-comment + creator-heart UI (a real
// backend is not running in `npm run ci`; the persistence round-trip is proven
// separately in the backend-backed suite). Follows e2e/comments.spec.ts's
// route-mocking conventions.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const CHANNEL = /\/api\/v1\/channels\/ada$/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const SAVED = /\/api\/v1\/me\/saved(\?|$)/;
const NO_RATING = { like_count: 0, dislike_count: 0, my_rating: null };

// The watch video carries a channel_handle so WatchView fetches the owning
// channel; canManageComments is (signed-in user id === channel.owner_id).
const detail = {
  id: "v1",
  channel_id: "ch1",
  channel_handle: "ada",
  title: "Watch Me",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 1,
  has_thumbnail: false,
};

const channel = {
  id: "ch1",
  owner_id: "u1",
  handle: "ada",
  display_name: "Ada Makes",
  description: "",
  follower_count: 3,
  created_at: "2024-03-10T00:00:00Z",
};

function comment(
  id: string,
  body: string,
  extra: Record<string, unknown> = {},
  username = "bob",
  display = "Bob Jones",
) {
  return {
    id,
    video_id: "v1",
    body,
    parent_id: null,
    author_id: `author-${id}`,
    author_username: username,
    author_display_name: display,
    remote: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    edited: false,
    deleted: false,
    pinned: false,
    hearted: false,
    ...extra,
  };
}

// Restore a session on boot (no login UI): restoreSession() POSTs /auth/refresh,
// then reads /auth/me. `userId` decides channel ownership (owner_id "u1").
async function signInAs(page: Page, userId: string) {
  const user = {
    id: userId,
    username: userId,
    email: `${userId}@example.test`,
    role: "user",
    email_verified: true,
    display_name: userId,
    bio: "",
    created_at: new Date().toISOString(),
  };
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) =>
    route.fulfill({
      json: { token: "acc", refresh_token: "ref", token_type: "Bearer", expires_in: 900, user },
    }),
  );
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: user }));
  await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
    route.fulfill({ json: { channels: [], limit: 15, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/me\/notifications\/unread-count$/, (route) =>
    route.fulfill({ json: { unread_count: 0 } }),
  );
}

async function routeWatchBasics(page: Page) {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
}

test("renders the pinned comment first with a Pinned badge (all viewers)", async ({ page }) => {
  // Anonymous viewer: the list serves the pinned comment first with pinned:true.
  await routeWatchBasics(page);
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          comment("c1", "pinned first", { pinned: true }),
          comment("c2", "just a comment"),
          comment("c3", "loved this", { hearted: true }),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.goto("/videos/v1");
  await expect(page.getByText("pinned first")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  // The pinned comment is the first row and carries the Pinned marker.
  const firstRow = commentsRegion.getByRole("list").first().locator("> li").first();
  await expect(firstRow).toContainText("pinned first");
  await expect(firstRow.getByTitle("Pinned by creator")).toBeVisible();
  // The hearted comment shows the creator-heart marker (accessible name).
  const heartedRow = commentsRegion.locator("li", { hasText: "loved this" });
  await expect(heartedRow.getByRole("img", { name: "Hearted by creator" })).toBeVisible();
  // The plain comment carries neither marker.
  const plainRow = commentsRegion.locator("li", { hasText: "just a comment" });
  await expect(plainRow.getByTitle("Pinned by creator")).toHaveCount(0);
  await expect(plainRow.getByRole("img", { name: "Hearted by creator" })).toHaveCount(0);
});

test("an owner pins another comment and the order + badges update", async ({ page }) => {
  await signInAs(page, "u1"); // owns channel ada (owner_id "u1") → can manage comments
  await routeWatchBasics(page);
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [comment("c1", "first comment"), comment("c2", "second comment", {}, "cat", "Cat Grant")],
        limit: 20,
        offset: 0,
      },
    }),
  );
  // Pinning c2 returns it with pinned:true (the server would also serve it first
  // on a refetch; the client hoists it without one).
  const pinCalls: string[] = [];
  await page.route(/\/api\/v1\/comments\/c2\/pin$/, (route) => {
    pinCalls.push(`${route.request().method()} ${route.request().url()}`);
    return route.fulfill({ json: comment("c2", "second comment", { pinned: true }, "cat", "Cat Grant") });
  });

  await page.goto("/videos/v1");
  await expect(page.getByText("second comment")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const roots = commentsRegion.getByRole("list").first();
  // Before: c1 is first (API order), no pinned marker anywhere.
  await expect(roots.locator("> li").first()).toContainText("first comment");
  await expect(commentsRegion.getByTitle("Pinned by creator")).toHaveCount(0);

  // The owner pins the second comment from its overflow menu.
  const secondRow = commentsRegion.locator("li", { hasText: "second comment" });
  await secondRow.getByRole("button", { name: "Comment actions" }).click();
  const pinned = page.waitForResponse(
    (r) => /\/api\/v1\/comments\/c2\/pin$/.test(r.url()) && r.request().method() === "PUT",
  );
  await page.getByRole("menuitem", { name: "Pin" }).click();
  await pinned;
  expect(pinCalls[0]).toContain("PUT ");
  expect(pinCalls[0]).toContain("/api/v1/comments/c2/pin");

  // After: the newly pinned comment is hoisted to the front and shows the badge.
  await expect(roots.locator("> li").first()).toContainText("second comment");
  const newFirst = roots.locator("> li").first();
  await expect(newFirst.getByTitle("Pinned by creator")).toBeVisible();
  // Exactly one pinned comment (only c2 now).
  await expect(commentsRegion.getByTitle("Pinned by creator")).toHaveCount(1);
});
