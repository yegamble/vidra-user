import { expect, test } from "@playwright/test";

import { seedPublishedChannel, uniqueId, videoComments } from "./fixtures";

// Proves the comment round trip against a real vidra-core + PostgreSQL: a viewer
// posts a comment from the watch page UI, it appears in the list, and the row is
// confirmed persisted by reading it back through the API.
test("posting a comment from the watch page persists it", async ({ page, request }) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  expect(await videoComments(request, videoId)).toHaveLength(0);

  // A fresh viewer signs up (the session lives in memory).
  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Reach the seeded video's watch page from the home feed (client-side nav keeps
  // the session) and post a comment.
  await page.getByRole("heading", { name: videoTitle }).click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();

  const body = `lovely clip ${id}`;
  await page.getByLabel("Add a comment").fill(body);
  await page.getByRole("button", { name: "Post" }).click();

  // It is visible in the UI...
  await expect(page.getByText(body)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments (1)" })).toBeVisible();

  // ...and persisted in the database (read back through the API).
  const persisted = await videoComments(request, videoId);
  expect(persisted).toHaveLength(1);
  expect(persisted[0].body).toBe(body);
  expect(persisted[0].author_username).toBe(`fan${id}`);
});

// Proves the comment EDIT round trip against a real vidra-core + PostgreSQL: the
// author posts a comment, edits it from the watch page, and the new body + the
// edited flag are confirmed persisted by reading them back through the API.
test("an author can edit their own comment, and it persists", async ({ page, request }) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);

  const id = uniqueId();
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-fan-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("heading", { name: videoTitle }).click();
  await expect(page.getByRole("heading", { level: 1, name: videoTitle })).toBeVisible();

  // Post a comment, then edit it.
  const original = `first draft ${id}`;
  await page.getByLabel("Add a comment").fill(original);
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByText(original)).toBeVisible();

  const revised = `revised text ${id}`;
  const commentsRegion = page.getByRole("region", { name: "Comments" });
  await commentsRegion.getByRole("button", { name: "Edit" }).click();
  const saved = page.waitForResponse(
    (r) => /\/api\/v1\/comments\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByLabel("Edit comment").fill(revised);
  await commentsRegion.getByRole("button", { name: "Save" }).click();
  await saved;

  // UI shows the revised body + the "(edited)" marker.
  await expect(page.getByText(revised)).toBeVisible();
  await expect(page.getByText("(edited)")).toBeVisible();

  // Persisted (DB evidence via API read): the body is updated and edited is true.
  const persisted = await videoComments(request, videoId);
  expect(persisted).toHaveLength(1);
  expect(persisted[0].body).toBe(revised);
  expect(persisted[0].edited).toBe(true);
});
