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
