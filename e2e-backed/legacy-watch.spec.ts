import { expect, test } from "@playwright/test";

import { seedPublishedChannel } from "./fixtures";

test("a legacy watch link redirects directly to the canonical video with its start time", async ({ page, request }) => {
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const path = `/videos/watch/${videoId}`;
  const [redirect] = await Promise.all([
    page.waitForResponse((r) => r.request().isNavigationRequest() && new URL(r.url()).pathname === path),
    page.goto(`${path}?t=5`),
  ]);

  expect(redirect.status()).toBe(302);
  const target = new URL(redirect.headers().location, redirect.url());
  expect(target.origin).toBe(new URL(redirect.url()).origin);
  expect(target.pathname).toMatch(/^\/v\/[A-Za-z0-9_-]{11}$/);
  expect(target.search).toBe("?t=5");
  await expect(page).toHaveURL(target.href);
  await expect(page.getByRole("heading", { name: videoTitle })).toBeVisible();
});
