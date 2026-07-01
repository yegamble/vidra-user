import { expect, test } from "@playwright/test";

import {
  conversationsFor,
  registerUser,
  seedComment,
  seedPublishedChannel,
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
