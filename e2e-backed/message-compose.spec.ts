import { expect, test } from "@playwright/test";

import { conversationsFor, registerUser, uniqueId } from "./fixtures";

// Proves the "New message" composer round trip against a real vidra-core +
// PostgreSQL: user A, from the inbox, starts a fresh conversation by typing user
// B's USERNAME (not an id), sends the first message, and that message persists —
// confirmed both by the thread showing it in A's UI and by reading B's inbox via
// B's own token (so the `messages` row exists for BOTH participants, proving a
// real cross-user, username-resolved round-trip, not an echo).
test("user A composes a new message to user B by username and it persists for B", async ({
  page,
  request,
}) => {
  // Two seeded users. B is the recipient A will address purely by username.
  const alice = await registerUser(request, "alice");
  const bob = await registerUser(request, "bob");

  // Alice signs in through the UI (the session lives in memory).
  await page.goto("/login");
  await page.getByLabel("Email").fill(alice.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Open the inbox and the New message composer (client-side nav keeps session).
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByRole("button", { name: "New message" }).click();
  const dialog = page.getByRole("dialog", { name: "New message" });

  const messageBody = `compose-${uniqueId()}`;
  await dialog.getByLabel("Username").fill(bob.username);
  await dialog.getByLabel("Message").fill(messageBody);

  // Send → start-by-username POST, then the message, then route to the thread.
  const started = page.waitForResponse(
    (r) =>
      /\/api\/v1\/conversations$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await dialog.getByRole("button", { name: "Send" }).click();
  await started;

  // Landed in the thread, which shows the just-sent first message.
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+$/);
  await expect(page.getByText(messageBody)).toBeVisible();

  // Persisted cross-user: Bob's OWN inbox (a real API read with Bob's token)
  // carries the conversation with Alice and her message as the last preview.
  const bobInbox = await conversationsFor(request, bob.token);
  expect(
    bobInbox.some(
      (c) => c.other_username === alice.username && c.last_message_body === messageBody,
    ),
  ).toBe(true);
});
