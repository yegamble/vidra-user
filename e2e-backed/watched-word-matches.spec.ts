import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  adminToken,
  API_URL,
  seedComment,
  seedPublishedChannel,
  uniqueId,
} from "./fixtures";

// Proves the watched-word review read against a real vidra-core + PostgreSQL: an
// admin adds a watched term, a comment containing it is posted (flagged by the
// backend on create), and the moderator review page lists that comment. Read-only
// page → this verifies the read contract against real match rows.
test("a moderator reviews a watched-word-flagged comment", async ({ page, request }) => {
  const id = uniqueId();
  const term = `flagword${id}`.toLowerCase();

  // The admin adds a unique watched term (before the comment is posted).
  const token = await adminToken(request);
  const add = await request.post(`${API_URL}/api/v1/admin/watched-words`, {
    headers: { authorization: `Bearer ${token}` },
    data: { word: term },
  });
  expect(add.ok()).toBeTruthy();

  // Seed a published video and post a comment containing the term → it is flagged.
  const { videoId, token: ownerToken } = await seedPublishedChannel(request);
  const body = `this comment contains ${term} and should be flagged`;
  await seedComment(request, videoId, ownerToken, body);

  // The deterministic admin opens the flagged-comments review page.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Word matches" }).click();

  // The flagged comment (a real match row) is listed.
  await expect(page.getByText(body)).toBeVisible();
});
