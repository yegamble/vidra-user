import { expect, test, type Page } from "@playwright/test";

// Mocked messaging coverage (a real backend is not running in `npm run ci`; the
// persistence round-trip is proven in e2e-backed/messaging.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const CONVERSATIONS = /\/api\/v1\/me\/conversations(\?|$)/;
const MESSAGES = /\/api\/v1\/conversations\/c1\/messages(\?|$)/;

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
            last_message_body: "hey ada",
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
  await page.getByRole("button", { name: "Send" }).click();
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
