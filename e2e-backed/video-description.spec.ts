import { expect, test } from "@playwright/test";

import {
  TINY_MP4_BASE64,
  channelVideos,
  createChannelViaStudioUI,
  publishViaStudioUI,
  startStudioUpload,
  uniqueId,
  videoDetail,
} from "./fixtures";

// Proves the video-description round trip against a real vidra-core + PostgreSQL:
// a creator publishes a video with a description and later edits it in the studio;
// both are confirmed persisted via the public video-detail API, and the final
// description renders on the watch page. All authed UI actions happen before the
// single hard navigation (which clears the in-memory session).
test("a creator sets and edits a video description", async ({ page, request }) => {
  const id = uniqueId();
  const handle = `ch${id}`;
  const title = `Described clip ${id}`;
  const description = `First description ${id}`;
  const newDescription = `Edited description ${id}`;

  // Sign up, create a channel, and publish a video WITH a description.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(`fan${id}`);
  await page.getByLabel("Email").fill(`e2e-desc-${id}@example.test`);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await createChannelViaStudioUI(page, handle, `Channel ${id}`);

  await startStudioUpload(page, {
    title,
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
    privacy: "public",
  });
  await page.getByLabel("Video description").fill(description);
  await publishViaStudioUI(page);
  await expect(page.getByText("Published!")).toBeVisible();

  const videoId = (await channelVideos(request, handle)).find((v) => v.title === title)!.id;

  // Persisted: the public detail API carries the description we published.
  expect((await videoDetail(request, videoId)).description).toBe(description);

  // Edit the description in the studio (still signed in — no hard nav yet).
  await page.getByRole("button", { name: "Refresh" }).click();
  const row = page.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Edit description")).toHaveValue(description);
  await page.getByLabel("Edit description").fill(newDescription);
  const patched = page.waitForResponse(
    (r) => /\/videos\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await patched;

  // Persisted: the edit is reflected in the public detail API.
  expect((await videoDetail(request, videoId)).description).toBe(newDescription);

  // Displayed: the watch page (a fresh load) shows the edited description.
  //
  // Count only VISIBLE copies. The server-seeded watch page streams its body
  // after the loading.tsx skeleton, as a `<div hidden id="S:n">` segment that
  // React's inline `$RV` script reveals up to ~300ms later. If AuthProvider's
  // boot-time session restore commits first, React client-renders the page
  // from the RSC payload instead, and the parked server copy stays in the DOM,
  // hidden, until `$RV` throws it away. A bare getByText counts that hidden
  // copy, which caused a strict-mode violation ("resolved to 2 elements") in
  // CI. Filtering to visible elements still fails if the description really
  // does render twice on screen.
  await page.goto(`/videos/${videoId}`);
  await expect(page.getByText(newDescription).filter({ visible: true })).toBeVisible();
});
