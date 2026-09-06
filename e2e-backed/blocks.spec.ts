import { expect, test } from "@playwright/test";

import { registerUser, seedComment, seedPublishedChannel, uniqueId } from "./fixtures";

// Proves the account-block round trip against a real vidra-core + PostgreSQL: a
// signed-in viewer blocks a commenter, their comments leave the thread at once
// and stay gone across a hard reload (the server applies the same per-viewer
// filter it applies to mutes), a direct message to them is refused, the block
// is confirmed persisted via the blocked-accounts page (a fresh API read), and
// unblocking restores both the comment and messaging.
//
// The immediate removal is the OWNER'S RULING, applied here deliberately: this
// spec used to pin the opposite ("the comment stays"), and the flow below is
// reshaped around it — the DM is opened BEFORE the block, because afterwards
// there is no comment row left to open its menu from.
test("blocking a user hides their comments and refuses direct messages until unblocked", async ({
  page,
  request,
}) => {
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

  // Messaging works BEFORE the block: open the 1:1 thread from the comment and
  // keep its URL — after the block the comment row is gone, so this is the only
  // way back to the thread that does not depend on it.
  const started = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await openCommentActions();
  await page.getByRole("menuitem", { name: "Message", exact: true }).click();
  await started;
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
  const threadUrl = page.url();

  // Back to the watch page for the block itself.
  await page.goBack();
  await expect(row).toBeVisible();

  // Block the commenter (awaited POST /me/blocks/:id).
  const blocked = page.waitForResponse(
    (r) => /\/api\/v1\/me\/blocks\/[^/]+$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await openCommentActions();
  await page.getByRole("menuitem", { name: "Block", exact: true }).click();
  await blocked;

  // The ruling: their comments leave the thread at once, with no reload…
  await expect(row).toBeHidden();
  // …and a HARD reload keeps them out, which is the server's own per-viewer
  // filter answering, not the client's optimistic removal.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();
  await expect(page.locator("li", { hasText: commentBody })).toBeHidden();

  // A direct message to the blocked user is now refused: core rejects the send
  // into the existing thread (ErrBlocked), and the bubble says so.
  await page.goto(threadUrl);
  await page.getByRole("textbox", { name: "Write a message" }).fill("still there?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Not sent" })).toBeVisible();

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

  // Back on the watch page the comment is BACK — the shipped promise is that a
  // block hides content on the next load, so lifting it restores it there —
  // and messaging works again → lands on the real thread.
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("heading", { name: videoTitle }).first().click();
  const row2 = page.locator("li", { hasText: commentBody });
  await expect(row2).toBeVisible();
  const restarted = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await row2.getByRole("button", { name: "Comment actions" }).click();
  await page.getByRole("menuitem", { name: "Message", exact: true }).click();
  await restarted;
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
});
