import { expect, test, type Page } from "@playwright/test";

import { API_URL, registerUser, sendDirectMessage, uniqueId } from "./fixtures";

// The header NotificationsBell is now a <button aria-label="Notifications (N
// unread)"> that opens a popover (it is no longer a link). The full list lives
// on /notifications, reached via the popover's "See all notifications" link —
// so opening the list is: click the bell, then click that footer link.
async function openNotificationsList(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("link", { name: "See all notifications" }).click();
}

// Proves the notifications round trip against a real vidra-core + PostgreSQL: a
// fan follows a channel (creating a notification for the owner), the owner logs
// in through the UI and sees it with an unread badge, then marks it read — and a
// fresh authed refetch keeps it read (the read persisted). DB evidence (the
// notifications.read_at flip) is captured separately via psql.
test("a follow notifies the channel owner, who can read and clear it", async ({ page, request }) => {
  const id = uniqueId();
  const ownerEmail = `e2e-owner-${id}@example.test`;
  const password = "supersecret-e2e";
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;

  // Owner registers + creates a channel via the API (so we can log in as them).
  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: `owner${id}`, email: ownerEmail, password },
  });
  const ownerToken = ((await reg.json()) as { token: string }).token;
  await request.post(`${API_URL}/api/v1/channels`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { handle, display_name: channelName },
  });

  // A fan registers and follows the channel → creates a notification for the owner.
  const fanReg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username: `fan${id}`, email: `e2e-fan-${id}@example.test`, password },
  });
  const fanToken = ((await fanReg.json()) as { token: string }).token;
  await request.post(`${API_URL}/api/v1/channels/${handle}/follow`, {
    headers: { Authorization: `Bearer ${fanToken}` },
  });

  // The owner logs in through the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The header bell reflects the unread notification.
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();

  // Open the list (client-side nav) → the follow notification is shown.
  await openNotificationsList(page);
  const message = page.getByText(new RegExp(`started following ${channelName}`));
  await expect(message).toBeVisible();

  // Mark it read; the read persists across a fresh refetch (navigate away + back).
  const read = page.waitForResponse(
    (r) => /\/me\/notifications\/[^/]+\/read$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Mark as read" }).click();
  await read;

  await page.getByRole("link", { name: "Home" }).click();
  await openNotificationsList(page);
  await expect(page.getByText(new RegExp(`started following ${channelName}`))).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as read" })).toHaveCount(0);
});

// Proves the message-notification round trip against a real vidra-core + PostgreSQL:
// a sender direct-messages the recipient (via the API), the recipient logs in
// through the UI and sees a "message" notification with an unread badge, then
// clicks it through to the real conversation thread showing the message body.
test("a direct message notifies the recipient, who can open the thread", async ({ page, request }) => {
  const recipient = await registerUser(request, "rcp");
  const sender = await registerUser(request, "snd");
  const body = `dm-${uniqueId()}`;
  const conversationId = await sendDirectMessage(request, sender.token, recipient.id, body);

  // The recipient logs in through the UI (registerUser uses this password).
  await page.goto("/login");
  await page.getByLabel("Email").fill(recipient.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // The header bell reflects the unread message notification.
  await expect(page.getByRole("button", { name: "Notifications (1 unread)" })).toBeVisible();

  // Open the list → the message notification is shown, then click through.
  await openNotificationsList(page);
  const link = page.getByRole("link", { name: `${sender.username} sent you a message` });
  await expect(link).toBeVisible();
  await link.click();

  // Landed on the real thread (fresh authed refetch): the message body is visible
  // in the thread pane. Scope to the thread's role=log — at desktop the split-
  // pane also shows the body in the conversation-rail preview, so an unscoped
  // getByText would match both.
  await expect(page).toHaveURL(new RegExp(`/messages/${conversationId}$`));
  await expect(page.getByRole("log").getByText(body)).toBeVisible();
});
