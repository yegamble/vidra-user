import { expect, test } from "@playwright/test";

import {
  conversationMessages,
  conversationsFor,
  inboxFor,
  registerUser,
  seedComment,
  seedPublishedChannel,
  sendDirectMessage,
  TINY_PNG_BASE64,
  uniqueId,
} from "./fixtures";

// Proves the direct-messaging round trip against a real vidra-core + PostgreSQL:
// a signed-in viewer starts a conversation with a commenter from the watch page,
// sends a message, and that message persists — confirmed both by a fresh inbox
// refetch in the UI and by reading the recipient's inbox via the API (so the
// `messages` row is proven to exist for BOTH participants, not just echoed back).
test("a viewer can message a commenter and the message persists", async ({ page, request }) => {
  // Seed a published video and a comment on it by a separate account (the recipient).
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const commenter = await registerUser(request, "cmt");
  const commentBody = `msg-me-${uniqueId()}`;
  await seedComment(request, videoId, commenter.token, commentBody);

  // A fresh viewer signs up (the session lives in memory).
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Reach the watch page from the home feed (client-side nav keeps the session).
  await page.getByRole("heading", { name: videoTitle }).click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();
  await expect(page.getByText(commentBody)).toBeVisible();

  // Start a conversation from the commenter's comment → routed to the thread.
  const started = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.locator("li", { hasText: commentBody }).getByRole("button", { name: "Message" }).click();
  await started;
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);

  // Send a message → it appears in the thread.
  const messageBody = `hello-${uniqueId()}`;
  const sent = page.waitForResponse(
    (r) =>
      /\/api\/v1\/conversations\/[^/]+\/messages$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.getByLabel("Write a message").fill(messageBody);
  await page.getByRole("button", { name: "Send" }).click();
  await sent;
  await expect(page.getByText(messageBody)).toBeVisible();

  // Persistence via a fresh UI refetch: the inbox shows the conversation + preview.
  await page.getByRole("link", { name: "Messages" }).first().click();
  await expect(page.getByText(commenter.username)).toBeVisible();
  await expect(page.getByText(messageBody)).toBeVisible();

  // Persistence for the OTHER participant: the recipient's inbox (a real API read
  // with the recipient's own token) carries the message body.
  const recipientInbox = await conversationsFor(request, commenter.token);
  expect(recipientInbox.some((c) => c.last_message_body === messageBody)).toBe(true);
});

// Proves the DM ATTACHMENT round trip against a real vidra-core + PostgreSQL: a
// signed-in viewer attaches an image, sends it, sees it render inline, and the
// OTHER participant's API read of the thread carries the same attachment (so the
// dm_attachments row + link is proven for both sides, not just echoed back).
test("a DM attachment round-trips: upload, send, appears, and the recipient sees it", async ({
  page,
  request,
}) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const commenter = await registerUser(request, "cmt");
  const commentBody = `attach-me-${uniqueId()}`;
  await seedComment(request, videoId, commenter.token, commentBody);

  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("heading", { name: videoTitle }).click();
  await expect(page.getByText(commentBody)).toBeVisible();

  // Start the conversation from the comment → routed to the thread.
  const started = page.waitForResponse(
    (r) => /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.locator("li", { hasText: commentBody }).getByRole("button", { name: "Message" }).click();
  await started;
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
  const conversationId = page.url().split("/messages/")[1];

  // Attach an image via the composer file input; wait for the upload to persist.
  const filename = `pic-${id}.png`;
  const uploaded = page.waitForResponse(
    (r) =>
      /\/conversations\/[^/]+\/attachments$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: filename, mimeType: "image/png", buffer: Buffer.from(TINY_PNG_BASE64, "base64") });
  await uploaded;
  await expect(page.getByText(filename)).toBeVisible();

  // Send the message carrying the attachment.
  const sent = page.waitForResponse(
    (r) =>
      /\/conversations\/[^/]+\/messages$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Send" }).click();
  await sent;

  // It renders inline in the thread (fetched participant-gated with the token).
  await expect(page.getByRole("img", { name: filename })).toBeAttached();

  // Persisted for the OTHER participant: the recipient's own API read of the
  // thread carries the message with an image attachment of the same filename.
  const recipientView = await conversationMessages(request, commenter.token, conversationId);
  const withAttachment = recipientView.messages.find((m) => (m.attachments?.length ?? 0) > 0);
  expect(withAttachment).toBeTruthy();
  expect(withAttachment?.attachments?.[0].filename).toBe(filename);
  expect(withAttachment?.attachments?.[0].kind).toBe("image");
});

// Proves the READ-RECEIPT round trip: a sender messages a recipient; opening the
// thread in the UI advances the recipient's read watermark, which persists (the
// recipient's unread count drops to zero) AND becomes visible to the sender as
// their peer's "Seen" watermark on their own message.
test("a read receipt persists: opening a thread clears unread and the sender sees Seen", async ({
  page,
  request,
}) => {
  const sender = await registerUser(request, "snd");
  const recipient = await registerUser(request, "rcp");
  const body = `read-me-${uniqueId()}`;
  const conversationId = await sendDirectMessage(request, sender.token, recipient.id, body);

  // Before reading: the recipient's inbox shows the conversation as unread.
  const beforeInbox = await inboxFor(request, recipient.token);
  const beforeConv = beforeInbox.find((c) => c.id === conversationId);
  expect(beforeConv?.unread_count ?? 0).toBeGreaterThan(0);

  // The recipient logs in through the UI and opens the thread.
  await page.goto("/login");
  await page.getByLabel("Email").fill(recipient.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const read = page.waitForResponse(
    (r) => /\/conversations\/[^/]+\/read$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByText(body).click();
  await read;
  await expect(page.getByText(body)).toBeVisible();

  // After reading: the recipient's unread count for the conversation is zero.
  const afterInbox = await inboxFor(request, recipient.token);
  const afterConv = afterInbox.find((c) => c.id === conversationId);
  expect(afterConv?.unread_count ?? 0).toBe(0);

  // The SENDER now sees the recipient's read watermark on their own message.
  const senderView = await conversationMessages(request, sender.token, conversationId);
  const myMessage = senderView.messages.find((m) => m.body === body);
  expect(myMessage).toBeTruthy();
  expect(senderView.peer_last_read_message_id).toBe(myMessage?.id);
});
