import { expect, test } from "@playwright/test";

// Mocked comments coverage (a real backend is not running in `npm run ci`; the
// persistence round-trip is proven separately in e2e-backed/comments.spec.ts).
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const NO_RATING = { like_count: 0, dislike_count: 0, my_rating: null };
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;

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
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function comment(id: string, body: string, username = "bob", display = "Bob Jones") {
  return {
    id,
    video_id: "v1",
    body,
    author_id: `author-${id}`,
    author_username: username,
    author_display_name: display,
    remote: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// A federated (remote-authored) comment as the API serves it: no local account
// (author_id null), an author-name snapshot, and the origin domain.
function remoteComment(id: string, body: string, domain = "videos.example") {
  return {
    id,
    video_id: "v1",
    body,
    parent_id: null,
    author_id: null,
    author_username: "remote-rene",
    author_display_name: "Remote Rene",
    remote: true,
    author_domain: domain,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    edited: false,
  };
}

test("shows a video's comments and prompts anonymous viewers to sign in", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: { comments: [comment("c1", "First!"), comment("c2", "Nice one")], limit: 20, offset: 0 },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Comments (2)" })).toBeVisible();
  await expect(page.getByText("First!")).toBeVisible();
  await expect(page.getByText("Nice one")).toBeVisible();
  await expect(page.getByText("Bob Jones").first()).toBeVisible();
  // Anonymous viewers cannot post.
  await expect(page.getByText("to leave a comment")).toBeVisible();
  await expect(page.getByLabel("Add a comment")).toHaveCount(0);
});

test("an authenticated viewer can post a comment", async ({ page }) => {
  // Sign in; the session lives in memory, so reach the watch page via client-side nav.
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) => {
    if (route.request().method() === "POST") {
      void route.fulfill({ json: comment("new1", "Great video", "ada", "Ada Makes") });
    } else {
      void route.fulfill({ json: { comments: [], limit: 20, offset: 0 } });
    }
  });
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  // Navigate to the watch page from the home feed card (keeps the session).
  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByRole("heading", { name: "Comments (0)" })).toBeVisible();

  await page.getByLabel("Add a comment").fill("Great video");
  await page.getByRole("button", { name: "Post" }).click();

  await expect(page.getByText("Great video")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments (1)" })).toBeVisible();
});

test("a federated comment shows the author snapshot with origin + protocol badges", async ({
  page,
}) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [remoteComment("rc1", "Greetings from afar"), comment("c1", "Local reply")],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");
  await expect(page.getByText("Greetings from afar")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const remoteRow = commentsRegion.locator("li", { hasText: "Greetings from afar" });
  // Author-name snapshot renders as plain text — no local profile/account link.
  await expect(remoteRow.getByText("Remote Rene")).toBeVisible();
  await expect(remoteRow.getByRole("link")).toHaveCount(0);
  // Origin-domain badge + the shared ActivityPub protocol label.
  await expect(remoteRow.getByText("videos.example")).toBeVisible();
  await expect(remoteRow.getByText("ActivityPub")).toBeVisible();
  // The local comment carries neither.
  const localRow = commentsRegion.locator("li", { hasText: "Local reply" });
  await expect(localRow.getByText("videos.example")).toHaveCount(0);
  await expect(localRow.getByText("ActivityPub")).toHaveCount(0);
});

test("a signed-in viewer gets Mute instance + Report on a federated comment instead of the account controls", async ({
  page,
}) => {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          remoteComment("rc1", "Greetings from afar"),
          remoteComment("rc2", "Also from afar"),
          comment("c1", "Local reply"),
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  const muteCalls: string[] = [];
  await page.route(/\/api\/v1\/me\/mutes\/instances\/[^/]+$/, (route) => {
    muteCalls.push(`${route.request().method()} ${route.request().url()}`);
    return route.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByText("Greetings from afar")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const remoteRow = commentsRegion.locator("li", { hasText: "Greetings from afar" });
  const localRow = commentsRegion.locator("li", { hasText: "Local reply" });

  // Remote row: Mute instance + Report only — no Message/Mute/Block (no local account).
  await expect(
    remoteRow.getByRole("button", { name: "Mute instance videos.example" }),
  ).toBeVisible();
  await expect(remoteRow.getByRole("button", { name: "Report this comment" })).toBeVisible();
  await expect(remoteRow.getByRole("button", { name: "Message" })).toHaveCount(0);
  await expect(remoteRow.getByRole("button", { name: "Mute", exact: true })).toHaveCount(0);
  await expect(remoteRow.getByRole("button", { name: "Block", exact: true })).toHaveCount(0);
  await expect(remoteRow.getByRole("button", { name: "Report this user" })).toHaveCount(0);
  // Local row keeps the full account controls.
  await expect(localRow.getByRole("button", { name: "Mute", exact: true })).toBeVisible();
  await expect(localRow.getByRole("button", { name: "Message" })).toBeVisible();
  await expect(localRow.getByRole("button", { name: "Block", exact: true })).toBeVisible();

  // Muting the instance hides EVERY comment from that origin, keeps local ones.
  const muted = page.waitForResponse(
    (r) =>
      /\/api\/v1\/me\/mutes\/instances\/[^/]+$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await remoteRow.getByRole("button", { name: "Mute instance videos.example" }).click();
  await muted;

  await expect(page.getByText("Greetings from afar")).toHaveCount(0);
  await expect(page.getByText("Also from afar")).toHaveCount(0);
  await expect(page.getByText("Local reply")).toBeVisible();
  expect(muteCalls[0]).toContain("POST ");
  expect(muteCalls[0]).toContain("/api/v1/me/mutes/instances/videos.example");
});

test("an author can edit their own comment", async ({ page }) => {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: { comments: [comment("c1", "original body", "ada", "Ada Makes")], limit: 20, offset: 0 },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  // PATCH the comment → returns the edited body with edited=true.
  await page.route(/\/api\/v1\/comments\/c1$/, (route) => {
    if (route.request().method() === "PATCH") {
      void route.fulfill({ json: { ...comment("c1", "edited body", "ada", "Ada Makes"), edited: true } });
    } else {
      void route.fulfill({ status: 204, body: "" });
    }
  });

  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByText("original body")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  await commentsRegion.getByRole("button", { name: "Edit" }).click();
  const edited = page.waitForRequest(
    (r) => /\/api\/v1\/comments\/c1$/.test(r.url()) && r.method() === "PATCH",
  );
  await page.getByLabel("Edit comment").fill("edited body");
  await commentsRegion.getByRole("button", { name: "Save" }).click();
  const req = await edited;
  expect(req.postDataJSON()).toEqual({ body: "edited body" });

  // The list shows the new body and the "(edited)" marker.
  await expect(page.getByText("edited body")).toBeVisible();
  await expect(page.getByText("(edited)")).toBeVisible();
});

test("renders a reply nested one level under its parent comment", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          comment("c1", "parent comment"),
          // A reply carries parent_id pointing at the top-level comment.
          { ...comment("c2", "child reply"), parent_id: "c1" },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");
  await expect(page.getByText("parent comment")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  // Replies are collapsed by default behind a "View N replies" toggle (design).
  const toggle = commentsRegion.getByRole("button", { name: "View 1 reply" });
  await expect(toggle).toBeVisible();
  await expect(commentsRegion.getByRole("list", { name: "Replies" })).toHaveCount(0);
  await toggle.click();

  // Expanded: the reply lives inside the parent's "Replies" list (indented one
  // level), not as a sibling top-level comment; the toggle flips to "Hide replies".
  const replies = commentsRegion.getByRole("list", { name: "Replies" });
  await expect(replies).toHaveCount(1);
  await expect(replies.getByText("child reply")).toBeVisible();
  await expect(commentsRegion.getByRole("button", { name: "Hide replies" })).toBeVisible();
  // The heading counts every comment (flat), parent + reply.
  await expect(page.getByRole("heading", { name: "Comments (2)" })).toBeVisible();
});

test("a tombstoned comment renders as [deleted] with its reply thread preserved", async ({
  page,
}) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          // A tombstone: the author's account was deleted; the body is erased to
          // "[deleted]" and the thread stays intact (backend `deleted: true`).
          { ...comment("c1", "[deleted]"), deleted: true },
          { ...comment("c2", "still here"), parent_id: "c1" },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");
  const commentsRegion = page.getByRole("region", { name: "Comments" });
  // The tombstone shows "[deleted]" and offers no controls (no Reply on it).
  await expect(commentsRegion.getByText("[deleted]")).toBeVisible();
  // The preserved reply is reachable via the thread toggle.
  await commentsRegion.getByRole("button", { name: "View 1 reply" }).click();
  await expect(
    commentsRegion.getByRole("list", { name: "Replies" }).getByText("still here"),
  ).toBeVisible();
});

test("an authenticated viewer can reply, and the POST carries the parent_id", async ({ page }) => {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) => {
    if (route.request().method() === "POST") {
      // The server threads the reply and returns it with its parent_id set.
      void route.fulfill({
        json: { ...comment("r1", "well put", "ada", "Ada Makes"), parent_id: "c1" },
      });
    } else {
      void route.fulfill({
        json: { comments: [comment("c1", "parent comment", "bob", "Bob Jones")], limit: 20, offset: 0 },
      });
    }
  });
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByText("parent comment")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const parentRow = commentsRegion.locator("li", { hasText: "parent comment" }).first();
  await parentRow.getByRole("button", { name: "Reply", exact: true }).click();

  await page.getByLabel("Write a reply").fill("well put");
  const posted = page.waitForRequest(
    (r) => /\/api\/v1\/videos\/v1\/comments/.test(r.url()) && r.method() === "POST",
  );
  await commentsRegion.getByRole("button", { name: "Post reply" }).click();
  const req = await posted;
  // The reply POST sends the parent comment's id as parent_id.
  expect(req.postDataJSON()).toEqual({ body: "well put", parent_id: "c1" });

  // The new reply appears nested under its parent, optimistically from the response.
  const replies = commentsRegion.getByRole("list", { name: "Replies" });
  await expect(replies.getByText("well put")).toBeVisible();
});

test("the reply composer names the comment being replied to", async ({ page }) => {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [detail], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: { comments: [comment("c1", "parent comment", "bob", "Bob Jones")], limit: 20, offset: 0 },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );

  await page.getByRole("heading", { name: "Watch Me" }).click();
  await expect(page.getByText("parent comment")).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const parentRow = commentsRegion.locator("li", { hasText: "parent comment" }).first();
  await parentRow.getByRole("button", { name: "Reply", exact: true }).click();

  // A visible chip names the replied-to author, and the textarea's accessible
  // name carries the same target (announced without a live region).
  await expect(commentsRegion.getByText("Replying to @bob")).toBeVisible();
  const textarea = page.getByLabel("Write a reply to @bob");
  await expect(textarea).toBeVisible();
  // The handle is a chip, never prefilled into the body the user would delete.
  await expect(textarea).toHaveValue("");
});

test("a reply-to-reply leads with an @mention of the reply it answers", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({
      json: {
        comments: [
          comment("c1", "parent comment", "bob", "Bob Jones"),
          // r1 replies to the top-level comment; r2 replies to r1 (a reply).
          { ...comment("r1", "first reply", "ada", "Ada Lovelace"), parent_id: "c1" },
          { ...comment("r2", "nested reply", "cat", "Cat Grant"), parent_id: "r1" },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");
  const commentsRegion = page.getByRole("region", { name: "Comments" });
  // Both replies flatten under the top-level comment (one visual level).
  await commentsRegion.getByRole("button", { name: "View 2 replies" }).click();
  const replies = commentsRegion.getByRole("list", { name: "Replies" });

  // r2 answers r1, so it leads with "@ada" (r1's author) before its body.
  const nested = replies.locator("li", { hasText: "nested reply" });
  await expect(nested).toContainText("@ada");
  await expect(nested).toContainText("nested reply");
  // r1 answers the top-level comment directly → no mention (would be redundant).
  const direct = replies.locator("li", { hasText: "first reply" });
  await expect(direct).not.toContainText("@ada");
});

test("an anonymous viewer is prompted to sign in when replying", async ({ page }) => {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(COMMENTS, (route) =>
    route.fulfill({ json: { comments: [comment("c1", "parent comment")], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));

  await page.goto("/videos/v1");
  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const parentRow = commentsRegion.locator("li", { hasText: "parent comment" }).first();

  // An anonymous viewer still sees a Reply control...
  await parentRow.getByRole("button", { name: "Reply", exact: true }).click();
  // ...but it prompts sign-in instead of opening a composer.
  await expect(parentRow.getByText("to reply")).toBeVisible();
  await expect(parentRow.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Write a reply")).toHaveCount(0);
});
