import { expect, test, type Page } from "@playwright/test";

// Mocked account-block coverage (a real backend is not running in `npm run ci`;
// the persistence round-trip + DM-gating are proven in e2e-backed/blocks.spec.ts).
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const SAVED = /\/api\/v1\/me\/saved(\?|$)/;
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const BLOCK_ONE = /\/api\/v1\/me\/blocks\/[^/]+$/;
const BLOCKS_LIST = /\/api\/v1\/me\/blocks(\?|$)/;
const NO_RATING = { like_count: 0, dislike_count: 0, my_rating: null };

const detail = {
  id: "v1",
  channel_id: "c1",
  title: "Watch Me",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 1,
  has_thumbnail: false,
};

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u-ada",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function comment(id: string, body: string, authorId: string, username: string, display: string) {
  return {
    id,
    video_id: "v1",
    body,
    author_id: authorId,
    author_username: username,
    author_display_name: display,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

test("blocking a comment's author posts the block and removes their comments", async ({ page }) => {
  await signIn(page);

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          comment("cb", "hi from bob", "u-bob", "bob", "Bob Jones"),
          // A second author, so the assertion below can tell "the blocked
          // author's rows went" from "the list emptied".
          comment("ca", "hi from alice", "u-alice", "alice", "Alice Ng"),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  let blockedId: string | null = null;
  await page.route(BLOCK_ONE, (route) => {
    if (route.request().method() === "POST") {
      blockedId = route.request().url().match(/\/blocks\/([^/]+)$/)?.[1] ?? null;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });

  // Reach the watch page via the home feed card (keeps the in-memory session).
  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByText("hi from bob")).toBeVisible();

  // Block bob from his comment → POST fires; his rows leave the thread.
  const blocked = page.waitForResponse(
    (r) => BLOCK_ONE.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  // The per-comment contact/moderation actions now live behind a "Comment
  // actions" overflow menu; open it, then pick Block. The menu itself is
  // portaled to <body>, so menuitems are looked up at page level.
  const bobRow = page.locator("li", { hasText: "hi from bob" });
  await bobRow.getByRole("button", { name: "Comment actions" }).click();
  await page.getByRole("menuitem", { name: "Block", exact: true }).click();
  await blocked;
  expect(blockedId).toBe("u-bob");
  // The blocked author's comments go at once, exactly as Mute's do. This spec
  // used to pin the opposite ("the comment stays; the control reads Blocked"),
  // and it is changed here on the OWNER'S RULING, not to make a change fit: the
  // server already filters a blocked author out of this viewer's comment list
  // on the next load (the same per-viewer predicate it applies to mutes), so
  // the row disappeared on reload regardless — leaving it until then only made
  // two controls with the same effect look like they had different ones.
  await expect(page.getByText("hi from bob")).toBeHidden();
  // Alice's comment is untouched: the removal is scoped to the blocked author.
  await expect(page.getByText("hi from alice")).toBeVisible();
});

test("the blocked-accounts page lists blocked accounts and unblocks them", async ({ page }) => {
  await signIn(page);

  await page.route(BLOCKS_LIST, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: {
          users: [
            { user_id: "u-bob", username: "bob", display_name: "Bob Jones", blocked_at: new Date().toISOString() },
          ],
          limit: 100,
          offset: 0,
        },
      });
    }
    return route.continue();
  });
  await page.route(BLOCK_ONE, (route) =>
    route.request().method() === "DELETE" ? route.fulfill({ status: 204, body: "" }) : route.continue(),
  );

  // Settings → Blocked accounts (client-side nav keeps the session).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage blocked accounts" }).click();
  await expect(page.getByText("Bob Jones")).toBeVisible();
  await expect(page.getByText("@bob")).toBeVisible();

  const unblocked = page.waitForResponse(
    (r) => BLOCK_ONE.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unblock" }).click();
  await unblocked;

  await expect(page.getByText("Bob Jones")).toHaveCount(0);
  await expect(page.getByText("No blocked accounts")).toBeVisible();
});
