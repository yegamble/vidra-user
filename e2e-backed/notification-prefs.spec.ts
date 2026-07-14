import { expect, test } from "@playwright/test";

import { loginToken, notificationPrefs, uniqueId } from "./fixtures";

// Proves notification preferences persist against a real vidra-core +
// PostgreSQL: a user disables one type on /settings/notifications; the flip is
// read back through the API (the notification_preferences row) AND survives a
// hard reload (the page refetches from the server — not optimistic state).
test("disabling a notification type persists and survives a fresh load", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const email = `e2e-prefs-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI (the session lives in memory + refresh cookie).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`prefs${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Settings → Notifications (client-side nav keeps the in-memory session).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page
    .getByRole("dialog", { name: "Account menu" })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await page.getByRole("link", { name: "Manage notification preferences" }).click();
  await expect(page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();

  // Every type defaults to enabled; flip "New followers" off.
  const follow = page.getByRole("switch", { name: "New followers notifications" });
  await expect(follow).toHaveAttribute("aria-checked", "true");
  const patched = page.waitForResponse(
    (r) =>
      /\/api\/v1\/me\/notification-prefs$/.test(r.url()) &&
      r.request().method() === "PATCH" &&
      r.ok(),
  );
  await follow.click();
  await patched;
  await expect(follow).toHaveAttribute("aria-checked", "false");

  // Persisted: the API read shows follow=false while the other types stay on.
  const token = await loginToken(request, email, password);
  const prefs = await notificationPrefs(request, token);
  expect(prefs.follow).toBe(false);
  expect(prefs.comment).toBe(true);
  expect(prefs.message).toBe(true);

  // Fresh load: the httpOnly refresh cookie restores the session and the page
  // refetches the stored prefs — the switch is still off, from the server.
  await page.reload();
  const followAfterReload = page.getByRole("switch", { name: "New followers notifications" });
  await expect(followAfterReload).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("switch", { name: "Direct messages notifications" }),
  ).toHaveAttribute("aria-checked", "true");
});
