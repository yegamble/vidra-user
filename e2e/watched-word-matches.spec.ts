import { expect, test, type Page } from "@playwright/test";

// Mocked watched-word-matches coverage (a real backend is not running in
// `npm run ci`; the read against real matches is proven in
// e2e-backed/watched-word-matches.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const REPORTS = /\/api\/v1\/admin\/reports(\?|$)/;
const MATCHES = /\/api\/v1\/admin\/watched-word-matches(\?|$)/;

type Role = "user" | "moderator" | "admin";

function session(role: Role) {
  return {
    token: "acc",
    refresh_token: "ref",
    token_type: "Bearer",
    expires_in: 900,
    user: {
      id: "u1",
      username: "mod",
      email: "mod@example.test",
      role,
      email_verified: false,
      display_name: "Mod",
      bio: "",
      created_at: new Date().toISOString(),
    },
  };
}

function match(id: string, word: string, body: string, author = "bob") {
  return {
    id,
    word,
    type: "comment",
    comment_id: `c-${id}`,
    comment_body: body,
    video_id: "v1",
    video_title: "Some video",
    author_username: author,
    created_at: new Date().toISOString(),
  };
}

function videoMatch(id: string, word: string, title: string, author = "bob") {
  return {
    id,
    word,
    type: "video",
    video_id: "v2",
    video_title: title,
    author_username: author,
    created_at: new Date().toISOString(),
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(REPORTS, (route) => route.fulfill({ json: { reports: [], limit: 20, offset: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("mod@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

test("anonymous viewers are gated out of flagged comments", async ({ page }) => {
  let fetched = false;
  await page.route(MATCHES, (route) => {
    fetched = true;
    return route.fulfill({ json: { matches: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation/watched-word-matches");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a moderator reviews flagged comments and videos with type badges", async ({ page }) => {
  await signIn(page, "moderator");
  await page.route(MATCHES, (route) =>
    route.fulfill({
      json: {
        matches: [
          match("m1", "spam", "buy cheap SPAM now"),
          videoMatch("m2", "scam", "Totally legit scam tutorial", "carol"),
        ],
        limit: 100,
        offset: 0,
      },
    }),
  );

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Word matches" }).click();

  // The comment match: term badge + type badge + quoted body.
  await expect(page.getByText("buy cheap SPAM now")).toBeVisible();
  await expect(page.getByText("by bob")).toBeVisible();
  await expect(page.getByText("spam", { exact: true })).toBeVisible();
  await expect(page.getByText("comment", { exact: true })).toBeVisible();

  // The video match: type badge + the flagged video's title as the link.
  await expect(page.getByText("video", { exact: true })).toBeVisible();
  await expect(page.getByText("by carol")).toBeVisible();
  const videoLink = page.getByRole("link", { name: "Totally legit scam tutorial" });
  await expect(videoLink).toBeVisible();
  await expect(videoLink).toHaveAttribute("href", "/videos/v2");
});
