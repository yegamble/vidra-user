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

// Triage + snapshot fields every match now carries (core 0132). `snapshot` is
// the text as it read AT FLAG TIME; `body` is the LIVE comment, which may since
// have been edited. They are the same string unless a case sets them apart.
function triage() {
  return {
    match_offset: -1,
    match_length: 0,
    snapshot_backfilled: false,
    term_active: true,
    target_status: "present",
    status: "open",
    moderator_note: "",
  };
}

function match(
  id: string,
  word: string,
  body: string,
  author = "bob",
  snapshot = body,
) {
  return {
    ...triage(),
    id,
    word,
    type: "comment",
    comment_id: `c-${id}`,
    comment_body: body,
    matched_text: snapshot,
    target_status: snapshot === body ? "present" : "edited_away",
    video_id: "v1",
    video_title: "Some video",
    author_username: author,
    created_at: new Date().toISOString(),
  };
}

function videoMatch(id: string, word: string, title: string, author = "bob") {
  return {
    ...triage(),
    id,
    word,
    type: "video",
    video_id: "v2",
    video_title: title,
    matched_text: title,
    author_username: author,
    created_at: new Date().toISOString(),
  };
}

async function signIn(page: Page, role: Role) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session(role) }));
  await page.route(FEED, (route) =>
    route.fulfill({
      json: { videos: [], sort: "recent", limit: 20, offset: 0 },
    }),
  );
  await page.route(UNREAD, (route) =>
    route.fulfill({ json: { unread_count: 0 } }),
  );
  await page.route(REPORTS, (route) =>
    route.fulfill({ json: { reports: [], limit: 20, offset: 0 } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("mod@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
}

test("anonymous viewers are gated out of flagged comments", async ({
  page,
}) => {
  let fetched = false;
  await page.route(MATCHES, (route) => {
    fetched = true;
    return route.fulfill({ json: { matches: [], limit: 20, offset: 0 } });
  });
  await page.goto("/moderation/watched-word-matches");
  await expect(page.getByText("Moderators only")).toBeVisible();
  expect(fetched).toBe(false);
});

test("a moderator reviews flagged comments and videos with type badges", async ({
  page,
}) => {
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
  const videoLink = page.getByRole("link", {
    name: "Totally legit scam tutorial",
  });
  await expect(videoLink).toBeVisible();
  await expect(videoLink).toHaveAttribute("href", "/videos/v2");
});

test("the queue quotes the flag-time snapshot, not a body edited since", async ({
  page,
}) => {
  await signIn(page, "moderator");
  // The A16 defect: the excerpt used to be a live join, so an author who edited
  // the term away left the queue quoting a clean body under the flag.
  await page.route(MATCHES, (route) =>
    route.fulfill({
      json: {
        matches: [
          match(
            "m3",
            "spam",
            "never mind, plain cheese",
            "bob",
            "buy cheap SPAM now",
          ),
        ],
        limit: 100,
        offset: 0,
      },
    }),
  );

  await page.goto("/moderation/watched-word-matches");
  await expect(page.getByText("buy cheap SPAM now")).toBeVisible();
  await expect(page.getByText("never mind, plain cheese")).toHaveCount(0);
  await expect(
    page.getByText("The live comment no longer contains this term"),
  ).toBeVisible();
});

test("a moderator resolves a flagged item with a note", async ({ page }) => {
  await signIn(page, "moderator");
  let resolved: { url: string; body: unknown } | null = null;
  // The queue asks for OPEN by default, so the resolved row is gone on the
  // refetch — the server applies the filter, not the client.
  await page.route(MATCHES, (route) => {
    if (route.request().method() === "POST") {
      resolved = {
        url: route.request().url(),
        body: route.request().postDataJSON(),
      };
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({
      json: {
        matches: resolved ? [] : [match("m4", "spam", "buy cheap SPAM now")],
        limit: 100,
        offset: 0,
      },
    });
  });

  await page.goto("/moderation/watched-word-matches");
  await expect(page.getByText("buy cheap SPAM now")).toBeVisible();
  await page.getByLabel("Internal moderator note").fill("hid the comment");
  await page.getByRole("button", { name: "Resolve" }).click();

  await expect(page.getByText("buy cheap SPAM now")).toHaveCount(0);
  expect(resolved).not.toBeNull();
  expect(resolved!.url).toContain(
    "/api/v1/admin/watched-word-matches/m4/resolve",
  );
  expect(resolved!.body).toEqual({
    status: "resolved",
    note: "hid the comment",
  });
});
