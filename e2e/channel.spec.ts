import { expect, test, type Page } from "@playwright/test";

const CHANNEL = /\/api\/v1\/channels\/ada$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada\/videos$/;
const CHANNEL_DONATIONS = /\/api\/v1\/channels\/ada\/donation-addresses/;
const CHANNEL_LIVE = /\/api\/v1\/channels\/ada\/live$/;

const channel = {
  id: "ch1",
  owner_id: "u1",
  handle: "ada",
  display_name: "Ada Makes",
  description: "Cool videos about making things.",
  follower_count: 1500,
  // A stable past date so the About tab's "Joined" line is deterministic.
  created_at: "2024-03-10T00:00:00Z",
};

// Land the shell signed in as `userId` without the login UI: restoreSession()
// POSTs /auth/refresh on boot, then reads /auth/me. `userId` decides whether the
// viewer is the channel owner (owner_id "u1") — driving the visitor action
// cluster's owner gate.
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

function video(id: string, title: string) {
  return {
    id,
    channel_id: "ch1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
  };
}

test("shows the channel header and its videos", async ({ page }) => {
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video("v1", "Building a Desk")] } }),
  );

  await page.goto("/channels/ada");

  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  await expect(page.getByText("@ada")).toBeVisible();
  await expect(page.getByText("1.5K followers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Building a Desk" })).toBeVisible();
  // Anonymous visitors are invited to sign in before following.
  await expect(page.getByRole("link", { name: "Sign in to follow" })).toBeVisible();
  // The grid carries the shared sort chips (Latest active by default).
  const sort = page.getByRole("group", { name: "Sort videos" });
  await expect(sort.getByRole("button", { name: "Latest" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(sort.getByRole("button", { name: "Oldest" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("load more reveals the rest of a long channel grid", async ({ page }) => {
  // The channel-videos endpoint has no limit/offset contract: the backend
  // returns the full list and the grid reveals it in pages of 20 client-side.
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({
      json: { videos: Array.from({ length: 25 }, (_, i) => video(`v${i}`, `Clip ${i + 1}`)) },
    }),
  );

  await page.goto("/channels/ada");
  await expect(page.getByRole("heading", { name: "Clip 20" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clip 21" })).not.toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("heading", { name: "Clip 21" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clip 25" })).toBeVisible();
  // Everything is revealed: the pager hides.
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("shows a not-found state for a missing channel", async ({ page }) => {
  const notFound = {
    status: 404,
    json: { error: { code: "not_found", message: "channel not found" } },
  };
  await page.route(CHANNEL, (route) => route.fulfill(notFound));
  await page.route(CHANNEL_VIDEOS, (route) => route.fulfill(notFound));

  await page.goto("/channels/ada");
  await expect(page.getByText("Channel not found")).toBeVisible();
});

test("an authenticated visitor gets Follow, Support and Message actions", async ({ page }) => {
  await signInAs(page, "u2"); // not the owner (owner_id is "u1")
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video("v1", "Building a Desk")] } }),
  );
  // One public donation address ⇒ the Support affordance renders (else it hides).
  await page.route(CHANNEL_DONATIONS, (route) =>
    route.fulfill({
      json: {
        addresses: [
          {
            id: "da1",
            owner_id: "u1",
            network: "bitcoin",
            address: "bc1qexampleaddress",
            label: "",
            verified: false,
            created_at: new Date().toISOString(),
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(/\/api\/v1\/users\/u1\/donation-addresses/, (route) =>
    route.fulfill({ json: { addresses: [], limit: 20, offset: 0 } }),
  );

  await page.goto("/channels/ada");
  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  // The whole visitor cluster (Follow filled ↔ outlined, Support, Message).
  await expect(page.getByRole("button", { name: "Follow" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Support" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Message" })).toBeVisible();
});

test("the owner sees no follow/support/message cluster on their own channel", async ({ page }) => {
  await signInAs(page, "u1"); // the owner
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video("v1", "Building a Desk")] } }),
  );
  await page.route(CHANNEL_LIVE, (route) => route.fulfill({ json: { live_streams: [] } }));

  await page.goto("/channels/ada");
  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Message" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Support" })).toHaveCount(0);
});

test("the About tab shows the channel's real facts", async ({ page }) => {
  await page.route(CHANNEL, (route) => route.fulfill({ json: channel }));
  await page.route(CHANNEL_VIDEOS, (route) =>
    route.fulfill({ json: { videos: [video("v1", "Building a Desk")] } }),
  );

  await page.goto("/channels/ada");
  // Videos is the default tab; the grid is visible, the About panel is not.
  await expect(page.getByRole("heading", { name: "Building a Desk" })).toBeVisible();

  await page.getByRole("tab", { name: "About" }).click();
  // Facts drawn only from the real Channel payload + the listed-video count.
  // Scoped to the active panel: the header meta also says "followers" and the
  // tablist carries a "Videos" tab.
  const about = page.getByRole("tabpanel");
  await expect(about.getByText("Joined")).toBeVisible();
  await expect(about.getByText("Followers")).toBeVisible();
  await expect(about.getByText("Videos")).toBeVisible();
  // Switching away from Videos unmounts its grid.
  await expect(page.getByRole("heading", { name: "Building a Desk" })).toBeHidden();
});
