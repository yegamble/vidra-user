import { expect, test } from "@playwright/test";

import { channelDetail, uniqueId } from "./fixtures";

// Proves the channel edit + delete round trip against a real vidra-core +
// PostgreSQL: a creator makes a channel in the studio, renames it (name +
// description) inline, then deletes it. Both are confirmed via the public
// channel API — the edit persists (200 with the new values) and the delete
// persists (404, the channel is gone).
test("a creator can edit and delete their channel", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const byHandle = new RegExp(`/api/v1/channels/${handle}$`);

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-chan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByRole("link", { name: "Channel", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const created = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await created;

  // Edit the display name + description. The redesigned owner panel shows the
  // edit form inline on the Channel tab (no per-row "Edit" gate); Save is
  // "Save changes".
  await page.getByLabel("Edit channel name").fill(`Renamed ${id}`);
  await page.getByLabel("Edit channel description").fill("A fresh description.");
  const patched = page.waitForResponse(
    (r) => byHandle.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await patched;

  // Persisted: the studio channel switcher reflects the renamed channel and the
  // public API carries the new name + description.
  await expect(page.getByText(`Renamed ${id}`).first()).toBeVisible();
  expect(await channelDetail(request, handle)).toMatchObject({
    status: 200,
    display_name: `Renamed ${id}`,
    description: "A fresh description.",
  });

  // Delete it (two-step confirm).
  const deleted = page.waitForResponse(
    (r) => byHandle.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
  );
  await page.getByRole("button", { name: `Delete ${handle}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await deleted;

  // Persisted: the channel is gone from the studio UI and the public API (404).
  // With no channels left, the Channel tab shows the onboarding empty state.
  await expect(page.getByText("Create your first channel")).toBeVisible();
  expect((await channelDetail(request, handle)).status).toBe(404);
});
