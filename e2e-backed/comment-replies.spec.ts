import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { seedPublishedChannel, uniqueId, videoComments } from "./fixtures";

// A successful POST of a (top-level or threaded) comment on the watch page.
const commentPosted = (url: string, method: string, ok: boolean) =>
  /\/api\/v1\/videos\/[^/]+\/comments$/.test(url) && method === "POST" && ok;

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
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

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

// Proves reply-to-reply attribution end to end against a real vidra-core +
// PostgreSQL, with THREE distinct signed-in accounts (separate browser contexts,
// each its own in-memory session): A posts a top-level comment, B replies to A,
// C replies to B's reply. The replied-to author's handle is derived on the
// client (no backend field), so we assert both the live UI (C's composer names
// B; C's posted reply leads with "@B") and — the Critical Verification Rule — the
// persisted A ← B ← C parent chain and each author_username via a fresh API read.
test("a reply-to-reply attributes the replied-to author across three accounts", async ({
  page,
  request,
  browser,
}) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const id = uniqueId();
  const nameA = `ua${id}`;
  const nameB = `ub${id}`;
  const nameC = `uc${id}`;

  // Sign up a fresh account in the given page and land on the seeded watch page.
  async function signUpAndOpen(p: Page, username: string) {
    await p.goto("/signup");
    await p.getByLabel("Username").fill(username);
    await p.getByLabel("Email").fill(`e2e-${username}@example.test`);
    await p.getByLabel("Password").fill("supersecret-e2e");
    await p.getByRole("button", { name: "Create account" }).click();
    await expect(p.getByRole("button", { name: "Open account menu" })).toBeVisible();
    await p.getByRole("heading", { name: videoTitle }).click();
    await expect(p.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();
  }

  // A posts a top-level comment.
  await signUpAndOpen(page, nameA);
  const topBody = `top-level ${id}`;
  const aPosted = page.waitForResponse((r) =>
    commentPosted(r.url(), r.request().method(), r.ok()),
  );
  await page.getByLabel("Add a comment").fill(topBody);
  await page.getByRole("button", { name: "Post" }).click();
  await aPosted;
  await expect(page.getByText(topBody)).toBeVisible();

  // B (a separate session) replies to A's top-level comment; the composer names A.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signUpAndOpen(pageB, nameB);
  const regionB = pageB.getByRole("region", { name: "Comments" });
  const aRowB = regionB.locator("li", { hasText: topBody }).first();
  await aRowB.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(pageB.getByText(`Replying to @${nameA}`)).toBeVisible();
  const bBody = `reply-to-A ${id}`;
  const bReplied = pageB.waitForResponse((r) =>
    commentPosted(r.url(), r.request().method(), r.ok()),
  );
  await pageB.getByLabel(`Write a reply to @${nameA}`).fill(bBody);
  await regionB.getByRole("button", { name: "Post reply" }).click();
  await bReplied;
  await expect(pageB.getByText(bBody)).toBeVisible();
  await ctxB.close();

  // C (a third session) replies to B's reply — a reply-to-reply.
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await signUpAndOpen(pageC, nameC);
  const regionC = pageC.getByRole("region", { name: "Comments" });
  // Expand A's thread to reach B's reply (replies are collapsed by default).
  await regionC.getByRole("button", { name: "View 1 reply" }).click();
  const repliesC = regionC.getByRole("list", { name: "Replies" });
  const bRowC = repliesC.locator("li", { hasText: bBody }).first();
  await bRowC.getByRole("button", { name: "Reply", exact: true }).click();
  // C's composer names B as the target.
  await expect(pageC.getByText(`Replying to @${nameB}`)).toBeVisible();
  const cBody = `reply-to-B ${id}`;
  const cReplied = pageC.waitForResponse((r) =>
    commentPosted(r.url(), r.request().method(), r.ok()),
  );
  await pageC.getByLabel(`Write a reply to @${nameB}`).fill(cBody);
  await repliesC.getByRole("button", { name: "Post reply" }).click();
  await cReplied;
  // C's posted reply leads with the "@B" mention (a reply-to-reply).
  const cRow = repliesC.locator("li", { hasText: cBody }).first();
  await expect(cRow).toContainText(`@${nameB}`);
  await expect(cRow).toContainText(cBody);

  // DB proof (Critical Verification Rule): a fresh API read shows the A ← B ← C
  // parent chain and each author's handle — the exact fields client derivation
  // depends on, proven persisted against real Postgres.
  const persisted = await videoComments(request, videoId);
  expect(persisted).toHaveLength(3);
  const a = persisted.find((c) => c.body === topBody);
  const b = persisted.find((c) => c.body === bBody);
  const c = persisted.find((c) => c.body === cBody);
  expect(a?.parent_id).toBeNull();
  expect(b?.parent_id).toBe(a?.id);
  expect(c?.parent_id).toBe(b?.id);
  expect(a?.author_username).toBe(nameA);
  expect(b?.author_username).toBe(nameB);
  expect(c?.author_username).toBe(nameC);
  await ctxC.close();
});
