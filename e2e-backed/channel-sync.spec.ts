import { expect, test } from "@playwright/test";

import { channelSyncs, loginToken, uniqueId } from "./fixtures";

// Channel auto-sync (UPLOAD-13, backport W2.U5) against a real vidra-core +
// PostgreSQL. A creator binds a local channel to an external channel URL through
// the studio UI; the row must PERSIST (readable via GET /channel-syncs), a manual
// Sync now must be accepted (202), and a Remove must DELETE it. Worker execution
// is NOT required — the SSRF guard validates the URL WITHOUT resolving DNS at
// create time (the IP check runs at dial time), so a public platform URL is
// accepted offline and the row sits in waiting_first_run.
//
// Requires the backed stack to run with CHANNEL_SYNC_ENABLED=true AND
// YTDLP_IMPORT_ENABLED=true (both set in the frontend-e2e-backed workflow) —
// otherwise create/sync-now return the stable 503 and the UI shows its honest
// disabled state instead. Without those, this test is expected to be skipped.
test("a creator connects, syncs, and removes a channel auto-sync — the DB row persists then is gone", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const channelName = `Channel ${id}`;
  const externalUrl = `https://www.youtube.com/@example-${id}`;
  const email = `e2e-sync-${id}@example.test`;
  const password = "supersecret-e2e";

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`syncer${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(channelName);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // The auto-sync section is below the channel cards.
  await expect(
    page.getByRole("heading", { name: "Auto-import from another platform" }),
  ).toBeVisible();

  // If the feature is off on this stack, the create 503s → honest disabled state.
  // Skip rather than fail (the workflow enables it; a local stack may not).
  const token = await loginToken(request, email, password);

  await page.getByLabel("External channel URL").fill(externalUrl);
  const createResp = page.waitForResponse(
    (r) => /\/api\/v1\/channel-syncs$/.test(r.url()) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Connect" }).click();
  const created = await createResp;

  if (created.status() === 503) {
    test.skip(true, "channel auto-sync is disabled on this backed stack (CHANNEL_SYNC_ENABLED off)");
    return;
  }
  expect(created.status()).toBe(201);

  // The row renders with its state pill.
  const row = page.getByRole("listitem").filter({ hasText: externalUrl });
  await expect(row).toBeVisible();
  await expect(row.getByText("Waiting first run")).toBeVisible();

  // DB-proof (create): the sync persisted, readable via the API.
  const afterCreate = await channelSyncs(request, token);
  const persisted = afterCreate.find((s) => s.external_channel_url === externalUrl);
  expect(persisted).toBeTruthy();
  expect(persisted?.state).toBe("waiting_first_run");

  // Sync now is accepted (202 — scheduled for the next tick, not synchronous).
  const syncResp = page.waitForResponse((r) => /\/sync-now$/.test(r.url()) && r.request().method() === "POST");
  await row.getByRole("button", { name: /Sync .* now/ }).click();
  expect((await syncResp).status()).toBe(202);
  await expect(page.getByText("Sync scheduled — it’ll run on the next pass.")).toBeVisible();

  // Remove deletes the sync.
  const deleteResp = page.waitForResponse(
    (r) => /\/api\/v1\/channel-syncs\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE",
  );
  await row.getByRole("button", { name: /Remove sync/ }).click();
  expect((await deleteResp).status()).toBe(204);
  await expect(row).toHaveCount(0);

  // DB-proof (delete): the sync is gone from the caller's list.
  const afterDelete = await channelSyncs(request, token);
  expect(afterDelete.find((s) => s.external_channel_url === externalUrl)).toBeUndefined();
});
