import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_URL,
  channelVideos,
  seedPublishedChannel,
  videoIsPublic,
} from "./fixtures";

// Proves the quarantine approve round trip against a real vidra-core +
// PostgreSQL. Requires the backed stack to run with QUARANTINE_NEW_UPLOADS=true
// (the instance setting that parks fresh uploads for moderator review); when the
// stack runs without it the seeded upload publishes directly and the test skips
// honestly instead of passing on nothing.
//
// Flow: a creator's upload is seeded via the API and lands in "quarantined"
// (invisible to the public); the deterministic admin logs in through the UI,
// opens Moderation → Quarantine, and APPROVES it. Persistence is proven by the
// row staying gone after a fresh refetch (tab away + back), the owner's API
// read flipping to state=published, and the public detail now serving the
// video (it was 404 while held).
test("approving a quarantined upload publishes it for real", async ({ page, request }) => {
  // Seed an owner + channel + upload. Under QUARANTINE_NEW_UPLOADS the upload
  // finishes processing but parks in "quarantined" instead of publishing.
  const seeded = await seedPublishedChannel(request);
  const mine = (await channelVideos(request, seeded.handle, seeded.token)).find(
    (v) => v.title === seeded.videoTitle,
  );
  expect(mine).toBeTruthy();
  test.skip(
    mine!.state !== "quarantined",
    "QUARANTINE_NEW_UPLOADS is not enabled on the backed stack — nothing to approve",
  );

  // Held uploads are hidden from the public.
  expect(await videoIsPublic(request, mine!.id)).toBe(false);

  // The deterministic admin reviews the queue through the UI.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Quarantine" }).click();
  const row = page.locator("article").filter({ hasText: seeded.videoTitle });
  await expect(row).toBeVisible();

  const approved = page.waitForResponse(
    (r) => /\/admin\/videos\/[^/]+\/approve$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await row.getByRole("button", { name: "Approve" }).click();
  await approved;
  await expect(page.locator("article").filter({ hasText: seeded.videoTitle })).toHaveCount(0);

  // Fresh refetch (tab away + back) keeps the row out — not just optimistic state.
  await page.getByRole("link", { name: "Reports" }).click();
  await page.getByRole("link", { name: "Quarantine" }).click();
  await expect(page.locator("article").filter({ hasText: seeded.videoTitle })).toHaveCount(0);

  // Persisted: the owner read shows state=published and the public detail now serves it.
  const after = (await channelVideos(request, seeded.handle, seeded.token)).find(
    (v) => v.id === mine!.id,
  );
  expect(after?.state).toBe("published");
  expect(await videoIsPublic(request, mine!.id)).toBe(true);
});

// Proves the reject path persists: the rejected upload flips to state=failed
// (never published) and the owner receives a video_rejected notification.
test("rejecting a quarantined upload fails it and notifies the owner", async ({
  page,
  request,
}) => {
  const seeded = await seedPublishedChannel(request);
  const mine = (await channelVideos(request, seeded.handle, seeded.token)).find(
    (v) => v.title === seeded.videoTitle,
  );
  expect(mine).toBeTruthy();
  test.skip(
    mine!.state !== "quarantined",
    "QUARANTINE_NEW_UPLOADS is not enabled on the backed stack — nothing to reject",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Quarantine" }).click();
  const row = page.locator("article").filter({ hasText: seeded.videoTitle });
  await expect(row).toBeVisible();
  await row
    .getByRole("textbox", { name: `Rejection reason for ${seeded.videoTitle}` })
    .fill("e2e: not allowed on this instance");

  const rejected = page.waitForResponse(
    (r) => /\/admin\/videos\/[^/]+\/reject$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await row.getByRole("button", { name: "Reject" }).click();
  await rejected;
  await expect(page.locator("article").filter({ hasText: seeded.videoTitle })).toHaveCount(0);

  // Persisted: the owner read shows state=failed and the video never went public.
  const after = (await channelVideos(request, seeded.handle, seeded.token)).find(
    (v) => v.id === mine!.id,
  );
  expect(after?.state).toBe("failed");
  expect(await videoIsPublic(request, mine!.id)).toBe(false);

  // The owner got the video_rejected notification (the moderator identity and
  // the reason are never exposed by the contract).
  const notifRes = await request.get(`${API_URL}/api/v1/me/notifications?limit=100`, {
    headers: { Authorization: `Bearer ${seeded.token}` },
  });
  const notifs = ((await notifRes.json()) as {
    notifications: Array<{ type: string; video_id?: string }>;
  }).notifications;
  expect(
    notifs.some((n) => n.type === "video_rejected" && n.video_id === mine!.id),
  ).toBe(true);
});
