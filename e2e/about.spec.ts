import { expect, test } from "@playwright/test";

const INSTANCE = /\/api\/v1\/instance$/;
const FEED = /\/api\/v1\/videos(\?|$)/;

function instanceJson(federationEnabled: boolean) {
  return {
    name: "Vidra Test",
    description: "A test instance.",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: true,
    registration_requires_approval: false,
    oauth_providers: [],
    federation_enabled: federationEnabled,
    terms_url: "https://example.test/terms",
    privacy_url: "",
    contact_email: "admin@example.test",
  };
}

test("a federating instance carries the ActivityPub protocol badge on /about", async ({
  page,
}) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(true) }));
  await page.goto("/about");

  await expect(page.getByRole("heading", { name: "Vidra Test" })).toBeVisible();
  await expect(page.getByText("ActivityPub", { exact: true })).toBeVisible();
  await expect(page.getByText(/federates over ActivityPub/)).toBeVisible();
  await expect(page.getByText("A test instance.")).toBeVisible();
  await expect(page.getByText("vidra v0.1.0")).toBeVisible();
  await expect(page.getByText("Open — anyone can create an account.")).toBeVisible();
  await expect(page.getByRole("link", { name: "admin@example.test" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms of service" })).toBeVisible();
  // No privacy URL configured — no dead link.
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveCount(0);
});

test("a non-federating instance is labeled Local only", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(false) }));
  await page.goto("/about");

  await expect(page.getByText("Local only", { exact: true })).toBeVisible();
  await expect(page.getByText(/does not federate/)).toBeVisible();
  await expect(page.getByText("ActivityPub", { exact: true })).toHaveCount(0);
});

test("the sidebar About entry reaches the page", async ({ page }) => {
  await page.route(INSTANCE, (route) => route.fulfill({ json: instanceJson(true) }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.goto("/");

  await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "About" }).click();

  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "Vidra Test" })).toBeVisible();
});

test("an instance fetch failure shows the retryable error state", async ({ page }) => {
  let calls = 0;
  await page.route(INSTANCE, (route) => {
    calls++;
    if (calls === 1) {
      return route.fulfill({ status: 500, json: { error: { code: "internal", message: "boom" } } });
    }
    return route.fulfill({ json: instanceJson(true) });
  });
  await page.goto("/about");

  await expect(page.getByText("Could not load this instance's details.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Vidra Test" })).toBeVisible();
});
