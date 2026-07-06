import { expect, test } from "@playwright/test";

import { seedPublishedChannel, uniqueId, videoComments } from "./fixtures";

// Proves the threaded-reply round trip against a real vidra-core + PostgreSQL: a
// viewer posts a top-level comment from the watch page, then replies to it, both
// appear (the reply nested one level under its parent), and BOTH rows are
// confirmed persisted — with the reply carrying the parent's id as parent_id —
// by reading them back through the API on a fresh request.
test("posting a comment then replying to it persists the thread", async ({ page, request }) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  expect(await videoComments(request, videoId)).toHaveLength(0);

  // A fresh viewer signs up (the session lives in memory).
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Reach the seeded video's watch page from the home feed (client-side nav keeps
  // the session).
  await page.getByRole("heading", { name: videoTitle }).click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();

  // Post a top-level comment.
  const parentBody = `top-level ${id}`;
  await page.getByLabel("Add a comment").fill(parentBody);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(parentBody)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments (1)" })).toBeVisible();

  const commentsRegion = page.getByRole("region", { name: "Comments" });
  const parentRow = commentsRegion.locator("li", { hasText: parentBody }).first();

  // Reply to it.
  const replyBody = `nested reply ${id}`;
  await parentRow.getByRole("button", { name: "Reply", exact: true }).click();
  const replied = page.waitForResponse(
    (r) =>
      /\/api\/v1\/videos\/[^/]+\/comments$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Write a reply").fill(replyBody);
  await commentsRegion.getByRole("button", { name: "Post reply" }).click();
  await replied;

  // Both appear in the UI, the reply nested under its parent.
  await expect(page.getByText(replyBody)).toBeVisible();
  const replies = commentsRegion.getByRole("list", { name: "Replies" });
  await expect(replies.getByText(replyBody)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments (2)" })).toBeVisible();

  // Persisted (DB evidence via a fresh API read): the parent is top-level and the
  // reply points at it via parent_id.
  const persisted = await videoComments(request, videoId);
  expect(persisted).toHaveLength(2);
  const parent = persisted.find((c) => c.body === parentBody);
  const reply = persisted.find((c) => c.body === replyBody);
  expect(parent).toBeDefined();
  expect(reply).toBeDefined();
  expect(parent?.parent_id).toBeNull();
  expect(reply?.parent_id).toBe(parent?.id);
  expect(reply?.author_username).toBe(`fan${id}`);
});
