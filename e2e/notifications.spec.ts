import { expect, test, type Page } from "@playwright/test";

// Mocked notifications coverage (a real backend is not running in `npm run ci`;
// the persistence round-trip is proven in e2e-backed/notifications.spec.ts).
const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const LIST = /\/api\/v1\/me\/notifications(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const READ_ALL = /\/api\/v1\/me\/notifications\/read-all$/;
const READ_ONE = /\/api\/v1\/me\/notifications\/[^/]+\/read$/;

function followNotif(id: string, read: boolean) {
  return {
    id,
    type: "follow",
    read,
    created_at: new Date().toISOString(),
    actor: { username: "bob", display_name: "Bob" },
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
  };
}

function commentNotif(id: string, read: boolean) {
  return {
    id,
    type: "comment",
    read,
    created_at: new Date().toISOString(),
    actor: { username: "cara", display_name: "Cara" },
    video_id: "v1",
    video_title: "My clip",
  };
}

function messageNotif(id: string, read: boolean) {
  return {
    id,
    type: "message",
    read,
    created_at: new Date().toISOString(),
    actor: { username: "dave", display_name: "Dave" },
    conversation_id: "c1",
  };
}

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

async function signIn(page: Page, unread = 0) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: unread } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  // Let the post-login client navigation settle before tests interact with the
  // bell popover — an in-flight route change would (correctly) dismiss it.
  await page.waitForURL("**/");
}

test("notifications prompt anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByText("Sign in to see your notifications")).toBeVisible();
});

test("the header bell shows an unread badge and opens the notifications popover", async ({
  page,
}) => {
  await signIn(page, 2);
  // Bell badge reflects the unread count; the bell is a disclosure button.
  const bell = page.getByRole("button", { name: "Notifications (2 unread)" });
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("aria-expanded", "false");

  await page.route(LIST, (route) =>
    route.fulfill({
      json: {
        notifications: [followNotif("n1", false), commentNotif("n2", false)],
        unread_count: 2,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await bell.click();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Bob started following Ada Makes")).toBeVisible();
  await expect(page.getByText("Cara commented on My clip")).toBeVisible();

  // Escape closes the popover and hands focus back to the bell.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Bob started following Ada Makes")).toHaveCount(0);
  await expect(bell).toHaveAttribute("aria-expanded", "false");
  await expect(bell).toBeFocused();

  // "See all notifications" navigates to the full page (client-side).
  await bell.click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByText("Bob started following Ada Makes")).toBeVisible();
});

test("marking one notification read removes its unread control", async ({ page }) => {
  await signIn(page, 2);
  await page.route(LIST, (route) =>
    route.fulfill({
      json: {
        notifications: [followNotif("n1", false), commentNotif("n2", false)],
        unread_count: 2,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(READ_ONE, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  const markButtons = page.getByRole("button", { name: "Mark as read" });
  await expect(markButtons).toHaveCount(2);
  await markButtons.first().click();
  await expect(page.getByRole("button", { name: "Mark as read" })).toHaveCount(1);
});

test("mark all as read clears the unread controls", async ({ page }) => {
  await signIn(page, 2);
  await page.route(LIST, (route) =>
    route.fulfill({
      json: {
        notifications: [followNotif("n1", false), commentNotif("n2", false)],
        unread_count: 2,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(READ_ALL, (route) => route.fulfill({ status: 204, body: "" }));

  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  await expect(page.getByRole("button", { name: "Mark as read" })).toHaveCount(2);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
});

test("the notifications list shows an empty state", async ({ page }) => {
  await signIn(page, 0);
  await page.route(LIST, (route) =>
    route.fulfill({ json: { notifications: [], unread_count: 0, limit: 20, offset: 0 } }),
  );
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  await expect(page.getByText("No notifications yet")).toBeVisible();
});

test("a report_resolved notification states the outcome", async ({ page }) => {
  await signIn(page, 1);
  await page.route(LIST, (route) =>
    route.fulfill({
      json: {
        notifications: [
          {
            id: "n1",
            type: "report_resolved",
            read: false,
            created_at: new Date().toISOString(),
            report_id: "r1",
            report_status: "accepted",
            report_target_type: "video",
          },
        ],
        unread_count: 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  await expect(page.getByText("A moderator accepted your video report")).toBeVisible();
});

test("a message notification links to the conversation thread", async ({ page }) => {
  await signIn(page, 1);
  await page.route(LIST, (route) =>
    route.fulfill({
      json: {
        notifications: [messageNotif("n1", false)],
        unread_count: 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.getByRole("button", { name: /Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
  const link = page.getByRole("link", { name: "Dave sent you a message" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/messages/c1");
});

// --- Design refresh (DR8): the phone-only Inbox segmented control switches
// between the Notifications and Messages halves. Runs at a phone viewport (the
// control is `sm:hidden`); Messages keeps its own route, so the segments
// navigate client-side (the in-memory session survives).
const CONVERSATIONS = /\/api\/v1\/me\/conversations(\?|$)/;

// The shared signIn asserts the header "Sign out" button, which the phone shell
// tucks behind the avatar menu — so a phone-viewport sign-in confirms the authed
// landing via the bottom tab bar's Inbox link instead.
async function signInMobile(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
}

test.describe("mobile Inbox segmented control", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("switches between the Notifications and Messages halves of the Inbox", async ({ page }) => {
    await signInMobile(page);
    await page.route(LIST, (route) =>
      route.fulfill({
        json: {
          notifications: [followNotif("n1", false)],
          unread_count: 0,
          limit: 20,
          offset: 0,
        },
      }),
    );
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

    // Reach the Inbox landing via the phone bottom-tab (client-side nav).
    await page.getByRole("link", { name: "Inbox" }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText("Bob started following Ada Makes")).toBeVisible();

    // The segmented control's Messages half navigates to the messages route.
    const tabs = page.getByRole("group", { name: "Inbox sections" });
    await expect(tabs.getByRole("button", { name: "Notifications" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await tabs.getByRole("button", { name: "Messages" }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByText("Bob Builder")).toBeVisible();

    // …and back to the Notifications half.
    await page
      .getByRole("group", { name: "Inbox sections" })
      .getByRole("button", { name: "Notifications" })
      .click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByText("Bob started following Ada Makes")).toBeVisible();
  });
});
