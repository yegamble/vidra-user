import { expect, test, type Page } from "@playwright/test";

// Mocked messaging coverage (a real backend is not running in `npm run ci`; the
// persistence round-trip is proven in e2e-backed/messaging.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const CONVERSATIONS = /\/api\/v1\/me\/conversations(\?|$)/;
const MESSAGES = /\/api\/v1\/conversations\/c1\/messages(\?|$)/;
// POST /conversations (start-by-id or start-by-username). Anchored to end so it
// never collides with the inbox (/me/conversations) or a thread (/…/messages).
const START = /\/api\/v1\/conversations$/;

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

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("messages prompt anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByText("Sign in to see your messages")).toBeVisible();
});

test("the inbox lists conversations with the other participant and last message", async ({
  page,
}) => {
  await signIn(page);
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({
      json: {
        conversations: [
          {
            id: "c1",
            updated_at: new Date().toISOString(),
            other_user_id: "u2",
            other_username: "bob",
            other_display_name: "Bob Builder",
            last_message_body: "see you then",
            last_message_at: new Date().toISOString(),
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.getByRole("link", { name: "Messages" }).first().click();
  await expect(page.getByText("Bob Builder")).toBeVisible();
  await expect(page.getByText("see you then")).toBeVisible();
});

// inboxWithC1 routes the inbox to a single conversation "c1" (other = Bob) so a
// test can click into the thread via client-side nav (a hard goto would drop the
// in-memory session and land on the sign-in prompt instead).
async function openThreadC1(page: Page) {
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({
      json: {
        conversations: [
          {
            id: "c1",
            updated_at: new Date().toISOString(),
            other_user_id: "u2",
            other_username: "bob",
            other_display_name: "Bob Builder",
            // A rail snippet distinct from any thread body so the persistent
            // rail never collides with a bubble under getByText.
            last_message_body: "tap to open",
            last_message_at: new Date().toISOString(),
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByText("Bob Builder").click();
}

test("opening a thread shows messages and sending one appends it", async ({ page }) => {
  await signIn(page);
  await page.route(MESSAGES, (route) => {
    if (route.request().method() === "POST") {
      const body = (route.request().postDataJSON() as { body: string }).body;
      return route.fulfill({
        json: {
          id: "m2",
          conversation_id: "c1",
          sender_id: "u1",
          sender_username: "ada",
          sender_display_name: "Ada Makes",
          body,
          created_at: new Date().toISOString(),
        },
      });
    }
    return route.fulfill({
      json: {
        messages: [
          {
            id: "m1",
            conversation_id: "c1",
            sender_id: "u2",
            sender_username: "bob",
            sender_display_name: "Bob Builder",
            body: "hey ada",
            created_at: new Date().toISOString(),
          },
        ],
        limit: 100,
        offset: 0,
      },
    });
  });

  await openThreadC1(page);
  // Header derives the other participant from a message that isn't mine.
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toBeVisible();
  await expect(page.getByText("hey ada")).toBeVisible();

  await page.getByLabel("Write a message").fill("hello bob");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("hello bob")).toBeVisible();
});

test("a thread you cannot access shows a not-found state", async ({ page }) => {
  await signIn(page);
  await page.route(MESSAGES, (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "not_found", message: "conversation not found" } },
    }),
  );
  await openThreadC1(page);
  await expect(page.getByText("Conversation not found")).toBeVisible();
});

// --- DM completeness (attachments, link previews, read receipts, per-message
// controls). The persistence round trips (attachment upload, read receipt,
// message report) are proven in e2e-backed/.

const READ = /\/api\/v1\/conversations\/c1\/read$/;
const ATTACHMENTS = /\/api\/v1\/attachments\/[^/]+$/;
const DELETE_MSG = /\/api\/v1\/messages\/[^/]+$/;
const REPORT_MSG = /\/api\/v1\/messages\/[^/]+\/report$/;

// A valid 1x1 PNG (base64) so an inline image attachment actually decodes.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwcHAAAAGEAMGDX2mUAAAAAElFTkSuQmCC";

function meMessage(id: string, body: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: "c1",
    sender_id: "u1",
    sender_username: "ada",
    sender_display_name: "Ada Makes",
    body,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

function peerMessage(id: string, body: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: "c1",
    sender_id: "u2",
    sender_username: "bob",
    sender_display_name: "Bob Builder",
    body,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

// routeMessages replies to the thread's messages GET with a fixed payload
// (newest-first, as the API returns). Non-GET requests (a send) fall through.
async function routeMessages(page: Page, payload: Record<string, unknown>) {
  await page.route(MESSAGES, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { limit: 100, offset: 0, ...payload } });
  });
}

test("opening a thread marks it read and shows the peer's Seen watermark", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [meMessage("m2", "my latest"), peerMessage("m1", "hey ada")],
    peer_last_read_message_id: "m2",
  });
  let readHit = false;
  await page.route(READ, (route) => {
    readHit = route.request().method() === "POST";
    return route.fulfill({ status: 204, body: "" });
  });

  await openThreadC1(page);
  await expect(page.getByText("my latest")).toBeVisible();
  // The peer has read my newest message → a "Seen" marker sits under it.
  await expect(page.getByText("Seen")).toBeVisible();
  await expect.poll(() => readHit).toBe(true);
});

test("an image attachment renders inline and a pdf renders as a download row", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [
      peerMessage("m1", "files for you", {
        attachments: [
          { id: "a1", kind: "image", content_type: "image/png", filename: "photo.png", size_bytes: 1234 },
          { id: "a2", kind: "pdf", content_type: "application/pdf", filename: "report.pdf", size_bytes: 4096 },
        ],
      }),
    ],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));
  await page.route(ATTACHMENTS, (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.from(TINY_PNG_BASE64, "base64") }),
  );

  await openThreadC1(page);
  // The image is fetched with auth and rendered inline via an object URL.
  await expect(page.getByRole("img", { name: "photo.png" })).toBeAttached();
  // The pdf is a download row (filename + size + Download button), not inline.
  await expect(page.getByText("report.pdf")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download report.pdf" })).toBeVisible();
});

test("a message with a link preview renders the preview card", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [
      peerMessage("m1", "check https://example.com/post", {
        preview: {
          url: "https://example.com/post",
          title: "An Interesting Post",
          description: "A short summary of the linked page.",
        },
      }),
    ],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await openThreadC1(page);
  const card = page.getByRole("link", { name: /Open link: An Interesting Post/ });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "https://example.com/post");
  await expect(card).toHaveAttribute("target", "_blank");
  await expect(page.getByText("A short summary of the linked page.")).toBeVisible();
});

test("the inbox shows an unread badge for conversations with unread messages", async ({ page }) => {
  await signIn(page);
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({
      json: {
        conversations: [
          {
            id: "c1",
            updated_at: new Date().toISOString(),
            other_user_id: "u2",
            other_username: "bob",
            other_display_name: "Bob Builder",
            last_message_body: "unread hi",
            last_message_at: new Date().toISOString(),
            unread_count: 3,
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await page.getByRole("link", { name: "Messages" }).first().click();
  await expect(page.getByLabel("3 unread messages")).toBeVisible();
});

test("the sender can delete their message, which tombstones to [deleted]", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [meMessage("m2", "oops secret"), peerMessage("m1", "hey ada")],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));
  let deletedId: string | null = null;
  await page.route(DELETE_MSG, (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = route.request().url().match(/\/messages\/([^/]+)$/)?.[1] ?? null;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });

  await openThreadC1(page);
  await expect(page.getByText("oops secret")).toBeVisible();

  const deleted = page.waitForResponse(
    (r) => /\/messages\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Delete this message" }).click();
  await deleted;

  await expect(page.getByText("oops secret")).toHaveCount(0);
  await expect(page.getByText("[deleted]")).toBeVisible();
  expect(deletedId).toBe("m2");
});

test("a viewer can report the peer's message from the thread", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [peerMessage("m1", "abusive text")],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));
  let reportBody: unknown = null;
  await page.route(REPORT_MSG, (route) => {
    if (route.request().method() === "POST") {
      reportBody = route.request().postDataJSON();
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });

  await openThreadC1(page);
  await page.getByRole("button", { name: "Report this message" }).click();
  const dialog = page.getByRole("dialog", { name: "Report this message" });
  await dialog.getByLabel("Reason for report").fill("harassment");
  const reported = page.waitForResponse(
    (r) => /\/messages\/[^/]+\/report$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await dialog.getByRole("button", { name: "Submit report" }).click();
  await reported;
  await expect(page.getByText("your report has been sent to the moderators")).toBeVisible();
  expect(reportBody).toEqual({ reason: "harassment" });
});

// --- Messaging v2 thread-view core (grouping, separators, avatars, header,
// optimistic send + failed-retry, NEW divider). The persistence / cross-context
// delivery round trips are proven in e2e-backed/messaging.spec.ts.

const HOURS = 3600_000;

test("groups runs, shows day/gap separators, and drops per-bubble timestamps", async ({
  page,
}) => {
  await signIn(page);
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  await routeMessages(page, {
    // newest-first, as the API returns.
    messages: [
      peerMessage("p3", "standing by", { created_at: iso(60_000) }),
      meMessage("m1", "three passes to get it right", { created_at: iso(2 * HOURS) }),
      peerMessage("p2", "the highlights look incredible", { created_at: iso(26 * HOURS - 90_000) }),
      peerMessage("p1", "did the grade land", { created_at: iso(26 * HOURS) }),
    ],
    peer_last_read_message_id: "m1",
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await openThreadC1(page);
  // All four bodies render.
  await expect(page.getByText("did the grade land")).toBeVisible();
  await expect(page.getByText("three passes to get it right")).toBeVisible();
  await expect(page.getByText("standing by")).toBeVisible();
  // Three centered day/gap separators (leading day header, the today boundary,
  // and the >60-min gap) replace the in-bubble times. Separator <time> elements
  // carry the "·" mid-dot; the bubbles' hidden <time> (absolute time) does not.
  await expect(page.locator("time").filter({ hasText: "·" })).toHaveCount(3);
  // No per-message relative timestamps remain inside the bubbles.
  await expect(page.getByText(/\d+[a-z]+ ago/)).toHaveCount(0);
  // One avatar per OTHER-party run (p1+p2 run, p3 run); my run has none.
  await expect(page.getByTestId("run-avatar")).toHaveCount(2);
  // The peer read my last message → a single quiet "Seen".
  await expect(page.getByText("Seen")).toBeVisible();
});

test("the thread header shows the peer's name, handle, and a report affordance", async ({
  page,
}) => {
  await signIn(page);
  await routeMessages(page, { messages: [peerMessage("m1", "hey ada")] });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await openThreadC1(page);
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toBeVisible();
  await expect(page.getByText("@bob")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to messages" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Report this user" })).toBeVisible();
});

test("an optimistic send that fails shows Not sent · Retry and recovers on retry", async ({
  page,
}) => {
  await signIn(page);
  let posts = 0;
  await page.route(MESSAGES, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts += 1;
      if (posts === 1) {
        return route.fulfill({
          status: 500,
          json: { error: { code: "server_error", message: "boom" } },
        });
      }
      const body = (req.postDataJSON() as { body: string }).body;
      return route.fulfill({ json: meMessage("m2", body) });
    }
    return route.fulfill({
      json: { messages: [peerMessage("m1", "hey ada")], limit: 100, offset: 0 },
    });
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await openThreadC1(page);
  await page.getByLabel("Write a message").fill("second try");
  await page.getByRole("button", { name: "Send message" }).click();

  // The optimistic bubble stays and flips to a failed state with a Retry.
  await expect(page.getByText("second try")).toBeVisible();
  await expect(page.getByText(/Not sent/)).toBeVisible();
  const retry = page.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  await retry.click();
  // The retry succeeds: the message persists and the failed state clears.
  await expect(page.getByText("second try")).toBeVisible();
  await expect(page.getByText(/Not sent/)).toHaveCount(0);
});

test("a NEW-messages divider appears from the inbox unread hint", async ({ page }) => {
  await signIn(page);
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  await routeMessages(page, {
    messages: [
      peerMessage("p2", "and another", { created_at: iso(60_000) }),
      peerMessage("p1", "one unread", { created_at: iso(120_000) }),
      meMessage("m1", "my earlier note", { created_at: iso(3 * HOURS) }),
    ],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  // Route the inbox with an unread count so the row link carries ?unread=2.
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({
      json: {
        conversations: [
          {
            id: "c1",
            updated_at: new Date().toISOString(),
            other_user_id: "u2",
            other_username: "bob",
            other_display_name: "Bob Builder",
            last_message_body: "and another",
            last_message_at: new Date().toISOString(),
            unread_count: 2,
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByText("Bob Builder").click();

  await expect(page).toHaveURL(/\/messages\/c1\?unread=2$/);
  await expect(page.getByText("one unread")).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toBeVisible();
});

// --- Messaging v2 part 2: composer v2 (auto-grow, Enter-to-send, counter),
// media grids + lightbox, and the desktop split-pane rail. Persistence round
// trips are proven in e2e-backed/messaging.spec.ts.

test("Composer sends on Enter and Shift+Enter inserts a newline (desktop pointer)", async ({
  page,
}) => {
  await signIn(page);
  let posts = 0;
  await page.route(MESSAGES, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      posts += 1;
      const body = (req.postDataJSON() as { body: string }).body;
      return route.fulfill({ json: meMessage("m2", body) });
    }
    return route.fulfill({
      json: { messages: [peerMessage("m1", "hey ada")], limit: 100, offset: 0 },
    });
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await openThreadC1(page);
  const field = page.getByLabel("Write a message");
  // Shift+Enter inserts a newline and does NOT send (desktop = fine pointer).
  await field.fill("draft line");
  await field.press("Shift+Enter");
  await expect(field).toHaveValue("draft line\n");
  expect(posts).toBe(0);

  // Enter (no modifier) sends on a fine-pointer device.
  await field.fill("sent with enter");
  await field.press("Enter");
  await expect(page.getByText("sent with enter")).toBeVisible();
  expect(posts).toBe(1);
});

test("Composer shows a character counter near the limit", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, { messages: [peerMessage("m1", "hey ada")] });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));
  await openThreadC1(page);

  const field = page.getByLabel("Write a message");
  await expect(page.getByText(/\/ 5000/)).toHaveCount(0);
  await field.fill("a".repeat(4501));
  await expect(page.getByText("4501 / 5000")).toBeVisible();
});

test("multiple image attachments render as a grid and open in a lightbox", async ({ page }) => {
  await signIn(page);
  await routeMessages(page, {
    messages: [
      peerMessage("m1", "trip photos", {
        attachments: [
          { id: "i1", kind: "image", content_type: "image/png", filename: "one.png", size_bytes: 100 },
          { id: "i2", kind: "image", content_type: "image/png", filename: "two.png", size_bytes: 100 },
          { id: "i3", kind: "image", content_type: "image/png", filename: "three.png", size_bytes: 100 },
        ],
      }),
    ],
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));
  await page.route(ATTACHMENTS, (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.from(TINY_PNG_BASE64, "base64") }),
  );

  await openThreadC1(page);
  // Each image is a grid cell that opens the lightbox.
  await expect(page.getByRole("button", { name: /^View image/ })).toHaveCount(3);
  await page.getByRole("button", { name: "View image two.png" }).click();
  const dialog = page.getByRole("dialog", { name: "two.png" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Download" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

// A second conversation so the split-pane + search tests have something to sort.
function inboxTwo() {
  return {
    conversations: [
      {
        id: "c1",
        updated_at: new Date().toISOString(),
        other_user_id: "u2",
        other_username: "bob",
        other_display_name: "Bob Builder",
        last_message_body: "tap to open",
        last_message_at: new Date().toISOString(),
      },
      {
        id: "c2",
        updated_at: new Date(Date.now() - 3600_000).toISOString(),
        other_user_id: "u3",
        other_username: "aurora",
        other_display_name: "Aurora Lab",
        last_message_body: "shoot list soon",
        last_message_at: new Date(Date.now() - 3600_000).toISOString(),
      },
    ],
    limit: 20,
    offset: 0,
  };
}

test("desktop split-pane opens a thread while the rail persists", async ({ page }) => {
  await signIn(page);
  await page.route(CONVERSATIONS, (route) => route.fulfill({ json: inboxTwo() }));
  await page.route(MESSAGES, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ json: { messages: [peerMessage("m1", "hey ada")], limit: 100, offset: 0 } });
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("link", { name: "Messages" }).first().click();
  // The empty right pane shows the resting placeholder beside the rail.
  await expect(page.getByText("Your messages")).toBeVisible();
  await expect(page.getByText("Pick a conversation, or start a new one.")).toBeVisible();

  // Clicking a rail row swaps the thread and updates the URL.
  await page.getByText("Bob Builder").click();
  await expect(page).toHaveURL(/\/messages\/c1$/);
  await expect(page.getByRole("heading", { name: "Bob Builder" })).toBeVisible();
  await expect(page.getByText("hey ada")).toBeVisible();
  // The rail did not unmount: its search field is still present and still lists
  // the other conversation.
  await expect(page.getByRole("searchbox", { name: "Search conversations" })).toBeVisible();
  await expect(page.getByText("Aurora Lab")).toBeVisible();
});

test("the rail search filters conversations", async ({ page }) => {
  await signIn(page);
  await page.route(CONVERSATIONS, (route) => route.fulfill({ json: inboxTwo() }));

  await page.getByRole("link", { name: "Messages" }).first().click();
  await expect(page.getByText("Bob Builder")).toBeVisible();
  await expect(page.getByText("Aurora Lab")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search conversations" });
  await search.fill("aurora");
  await expect(page.getByText("Aurora Lab")).toBeVisible();
  await expect(page.getByText("Bob Builder")).toHaveCount(0);

  await search.fill("nobody-here");
  await expect(page.getByText(/No conversations match/)).toBeVisible();
});

// --- New message composer (start a fresh conversation by username from the
// inbox). The persistence round trip (cross-user, by username) is proven in
// e2e-backed/message-compose.spec.ts.

// openComposer signs in, routes an empty inbox, opens /messages via client-side
// nav (a hard goto drops the in-memory session), and opens the New message
// dialog — returning the dialog locator.
async function openComposer(page: Page) {
  await signIn(page);
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({ json: { conversations: [], limit: 20, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Messages" }).first().click();
  // The empty inbox offers the entry point.
  await expect(page.getByText("No messages yet")).toBeVisible();
  await page.getByRole("button", { name: "New message" }).click();
  return page.getByRole("dialog", { name: "New message" });
}

test("New message composer sends to a username and lands in the thread", async ({ page }) => {
  const dialog = await openComposer(page);

  let startBody: unknown = null;
  await page.route(START, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    startBody = route.request().postDataJSON();
    return route.fulfill({
      json: {
        id: "c1",
        encrypted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });
  // The thread's messages endpoint: echo the send (POST) and reflect it back on
  // the thread's initial load (GET) so the just-sent message is visible.
  let sentBody = "";
  await page.route(MESSAGES, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      sentBody = (req.postDataJSON() as { body: string }).body;
      return route.fulfill({ json: meMessage("m1", sentBody) });
    }
    return route.fulfill({
      json: { messages: sentBody ? [meMessage("m1", sentBody)] : [], limit: 100, offset: 0 },
    });
  });
  await page.route(READ, (route) => route.fulfill({ status: 204, body: "" }));

  await dialog.getByLabel("Username").fill("bob");
  await dialog.getByLabel("Message").fill("hello bob");

  const started = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send" }).click();
  await started;

  // Client-side nav to the thread, which shows the first message.
  await expect(page).toHaveURL(/\/messages\/c1$/);
  await expect(page.getByText("hello bob")).toBeVisible();
  // The composer POSTed the username form (recipient_username), not an id.
  expect(startBody).toEqual({ recipient_username: "bob" });
});

test("the composer reports an unknown username honestly", async ({ page }) => {
  const dialog = await openComposer(page);
  await page.route(START, (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "not_found", message: "recipient not found" } },
    }),
  );

  await dialog.getByLabel("Username").fill("nobody");
  await dialog.getByLabel("Message").fill("hi there");
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(dialog.getByText("No user found with that username.")).toBeVisible();
  // Still on the inbox — no navigation on failure.
  await expect(page).toHaveURL(/\/messages$/);
});

test("the composer explains you can't message yourself", async ({ page }) => {
  const dialog = await openComposer(page);
  await page.route(START, (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: "unprocessable_entity", message: "cannot message yourself" } },
    }),
  );

  await dialog.getByLabel("Username").fill("ada");
  await dialog.getByLabel("Message").fill("note to self");
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(dialog.getByText("You can't message yourself.")).toBeVisible();
});

test("the composer explains a blocked recipient", async ({ page }) => {
  const dialog = await openComposer(page);
  await page.route(START, (route) =>
    route.fulfill({
      status: 403,
      json: { error: { code: "forbidden", message: "cannot message this user" } },
    }),
  );

  await dialog.getByLabel("Username").fill("blocker");
  await dialog.getByLabel("Message").fill("hello?");
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(dialog.getByText("You can't message this user.")).toBeVisible();
});
