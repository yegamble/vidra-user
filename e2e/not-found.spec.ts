import { expect, test } from "@playwright/test";

const FEED_URL = /\/api\/v1\/videos(\?|$)/;

test("an unknown route renders the 404 page with site chrome and a way home", async ({
  page,
}) => {
  await page.route(FEED_URL, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  const response = await page.goto("/definitely/not/a/real/page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  // The site chrome (header/banner) is still present around the 404 body.
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  // The escape hatch works.
  await page.getByRole("link", { name: "Go home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Recent videos" })).toBeVisible();
});
