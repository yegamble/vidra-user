import { expect, test } from "@playwright/test";

const CHANNEL = /\/api\/v1\/channels\/ada$/;
const CHANNEL_VIDEOS = /\/api\/v1\/channels\/ada\/videos$/;

const channel = {
  id: "ch1",
  owner_id: "u1",
  handle: "ada",
  display_name: "Ada Makes",
  description: "Cool videos about making things.",
  follower_count: 1500,
  created_at: new Date().toISOString(),
};

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
