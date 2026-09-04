import { expect, test } from "@playwright/test";

import { registerUser, seedComment, seedPublishedChannel, uniqueId } from "./fixtures";

// Proves the account-block round trip against a real vidra-core + PostgreSQL: a
// signed-in viewer blocks a commenter, then a direct message to them is refused
// (403 surfaced in the UI); the block is confirmed persisted via the blocked-
// accounts page (a fresh API read); unblocking restores messaging.
test("blocking a user refuses direct messages until unblocked", async ({ page, request }) => {
  // Seed a published video and a comment on it by the account we'll block.
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const target = await registerUser(request, "tgt");
  const commentBody = `block-me-${uniqueId()}`;
  await seedComment(request, videoId, target.token, commentBody);

  // A fresh viewer signs up (the session lives in memory).
  const id = uniqueId();
  const viewer = `fan${id}`;
  await page.goto("/signup");
  await page.getByLabel("Username").fill(viewer);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Reach the watch page from the home feed (client-side nav keeps the session).
  // The home page may render the same video in BOTH the browse grid and the
  // "Trending now" recommendations rail (content-dependent), so take the first
  // matching card — every match links to the same watch page.
  await page.getByRole("heading", { name: videoTitle }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();
  const row = page.locator("li", { hasText: commentBody });
  await expect(row).toBeVisible();

  // The comment's secondary actions (Block/Message/Report) now live behind the
  // per-comment "Comment actions" kebab overflow menu, not inline buttons.
  const openCommentActions = () => row.getByRole("button", { name: "Comment actions" }).click();

  // Block the commenter (awaited POST /me/blocks/:id).
  const blocked = page.waitForResponse(
    (r) => /\/api\/v1\/me\/blocks\/[^/]+$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await openCommentActions();
  await page.getByRole("menuitem", { name: "Block", exact: true }).click();
  await blocked;

  // A direct message to the blocked user is now refused (403 surfaced as a toast).
  await openCommentActions();
  await page.getByRole("menuitem", { name: "Message", exact: true }).click();
  await expect(page.getByText("You can't message this user.")).toBeVisible();
  // did NOT navigate to a thread. Either watch-page spelling counts: the page
  // renders at /videos/{uuid} and then shows its /v/{sid} short alias.
  await expect(page).toHaveURL(/\/(videos|v)\/[^/]+$/);

  // Persistence: the block appears on the blocked-accounts page (a fresh API read).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page.getByRole("link", { name: "Manage blocked accounts" }).click();
  await expect(page.getByText(`@${target.username}`)).toBeVisible();

  // Unblock (awaited DELETE) → the list empties.
  const unblocked = page.waitForResponse(
    (r) => /\/api\/v1\/me\/blocks\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: "Unblock" }).click();
  await unblocked;
  await expect(page.getByText("No blocked accounts")).toBeVisible();

  // Back on the watch page, messaging works again → lands on the real thread.
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("heading", { name: videoTitle }).first().click();
  const started = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  const row2 = page.locator("li", { hasText: commentBody });
  await row2.getByRole("button", { name: "Comment actions" }).click();
  await page.getByRole("menuitem", { name: "Message", exact: true }).click();
  await started;
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
});
