import { expect, test } from "@playwright/test";

import { TINY_MP4_BASE64, channelVideos, publishViaStudioUI, uniqueId, videoDetail } from "./fixtures";

// Proves the free-form tags round trip against a real vidra-core + PostgreSQL:
// a creator enters tags in the studio publish form (Enter/comma commit, chips),
// the published video's tags persist (lowercased, alphabetical, per the
// contract) and are read back via the public detail API; editing replaces the
// whole set; and the watch page renders the tags as chips whose links drive
// the real ?tag= feed filter (the tagged video appears on the filtered browse).
test("a creator sets and edits a video's tags, and the tag filter finds it", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const title = `Tagged clip ${id}`;
  // A unique tag so the filtered-feed assertion can't collide with other runs.
  const tagA = `retro${id}`;
  const tagB = `gaming${id}`;
  const tagC = `fresh${id}`;

  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-tags-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
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

  // Publish with two tags (mixed case + comma commit → normalized chips).
  await page.getByLabel("Video title").fill(title);
  const tagsField = page.getByLabel("Video tags");
  await tagsField.fill(`${tagA.toUpperCase()}, ${tagB}`);
  await tagsField.press("Enter");
  await expect(page.getByRole("button", { name: `Remove tag ${tagA}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove tag ${tagB}` })).toBeVisible();
  await page.getByLabel("Video file").setInputFiles({
    name: "clip.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await publishViaStudioUI(page);
  await expect(page.getByText("Published!")).toBeVisible();

  const videoId = (await channelVideos(request, handle)).find((v) => v.title === title)!.id;

  // Persisted: the public detail carries the normalized set (lowercased,
  // alphabetical per the contract).
  const afterPublish = await videoDetail(request, videoId);
  expect(afterPublish.tags).toEqual([tagB, tagA].sort());

  // Edit: replace tagB with tagC (the PATCH replaces the whole set).
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: `Remove tag ${tagA}` })).toBeVisible(); // pre-filled
  await page.getByRole("button", { name: `Remove tag ${tagB}` }).click();
  const editField = page.getByLabel("Edit tags");
  await editField.fill(tagC);
  await editField.press("Enter");
  const patched = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await patched;

  const afterEdit = await videoDetail(request, videoId);
  expect(afterEdit.tags).toEqual([tagA, tagC].sort());

  // The watch page renders the tags as chips; following one drives the real
  // ?tag= feed filter and the tagged video appears on the filtered browse.
  await page.goto(`/videos/${videoId}`);
  const tagList = page.getByRole("list", { name: "Tags" });
  await expect(tagList.getByRole("link", { name: `Browse videos tagged ${tagC}` })).toBeVisible();
  await tagList.getByRole("link", { name: `Browse videos tagged ${tagC}` }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?tag=${tagC}$`));
  await expect(page.getByRole("main").getByText(`#${tagC}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
