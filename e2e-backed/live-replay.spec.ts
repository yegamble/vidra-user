import { expect, test } from "@playwright/test";

import { liveStreams, loginToken, uniqueId } from "./fixtures";

// Backend-backed proof that the studio "Save replay as a video" toggle persists.
// This is a DATA-MUTATING flow, so it is verified against a real vidra-core +
// PostgreSQL: a creator enables replay while creating a live stream, and reading
// the channel's live streams back via the API (as the creator) confirms the
// stored stream has replay_enabled = true. Run with `npm run e2e:backed` and the
// core stack up (see .ralph/AGENT.md); it is never part of `npm run ci`.
test("creating a live stream with replay enabled persists replay_enabled = true", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const email = `e2e-fan-${id}@example.test`;
  const password = "supersecret-e2e";
  const streamTitle = `Replay show ${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await page.getByLabel("Channel handle").fill(handle);
  await page.getByLabel("Channel display name").fill(`Channel ${id}`);
  const channelCreated = page.waitForResponse(
    (r) => /\/api\/v1\/channels$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create channel" }).click();
  await channelCreated;

  // Create a live stream WITH "Save replay as a video" checked.
  await page.getByLabel("Live stream title").fill(streamTitle);
  await page.getByLabel("Save replay as a video").check();
  const created = page.waitForResponse(
    (r) => /\/channels\/[^/]+\/live$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Create live stream" }).click();
  await created;

  // Persisted: the API read (as the creator) shows the stream with replay on.
  const token = await loginToken(request, email, password);
  const streams = await liveStreams(request, handle, token);
  const mine = streams.find((s) => s.title === streamTitle);
  expect(mine).toBeTruthy();
  expect(mine?.replay_enabled).toBe(true);

  // And the studio row reflects it — the per-row toggle is checked.
  const row = page.getByRole("listitem").filter({ hasText: streamTitle });
  await expect(row.getByLabel(`Save replay as a video for ${streamTitle}`)).toBeChecked();
});
