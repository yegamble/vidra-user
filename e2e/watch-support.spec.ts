import { expect, test } from "@playwright/test";

// The watch-page channel row + Support dialog (DR5), bound to the real public
// channel + donation-address reads. Anonymous viewer (the Follow control resolves
// to a sign-in link; Support is a public read, no auth needed).

const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const OWNER_ID = "u9";
const ETH_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

function detail() {
  return {
    id: "v1",
    channel_id: "c1",
    channel_handle: "grade-house",
    channel_display_name: "Grade House",
    title: "Watch Me",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
  };
}

const CHANNEL = {
  id: "c1",
  owner_id: OWNER_ID,
  handle: "grade-house",
  display_name: "Grade House",
  description: "",
  follower_count: 48_200,
  created_at: new Date().toISOString(),
  has_avatar: false,
  has_banner: false,
};

function ethAddress(verified: boolean) {
  return {
    id: "d1",
    owner_id: OWNER_ID,
    network: "ethereum",
    address: ETH_ADDRESS,
    label: "Main",
    verified,
    created_at: new Date().toISOString(),
  };
}

async function mockWatch(
  page: import("@playwright/test").Page,
  channelAddresses: unknown[],
) {
  await page.route(DETAIL, (route) => route.fulfill({ json: detail() }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
    route.fulfill({ json: { captions: [] } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
    route.fulfill({ json: { comments: [], limit: 20, offset: 0 } }),
  );
  await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
    route.fulfill({ json: { like_count: 0, dislike_count: 0, my_rating: null } }),
  );
  await page.route(/\/api\/v1\/channels\/grade-house$/, (route) =>
    route.fulfill({ json: CHANNEL }),
  );
  await page.route(/\/api\/v1\/channels\/grade-house\/videos(\?|$)/, (route) =>
    route.fulfill({ json: { videos: [] } }),
  );
  await page.route(/\/api\/v1\/channels\/grade-house\/donation-addresses/, (route) =>
    route.fulfill({ json: { addresses: channelAddresses, limit: 20, offset: 0 } }),
  );
  await page.route(new RegExp(`/api/v1/users/${OWNER_ID}/donation-addresses`), (route) =>
    route.fulfill({ json: { addresses: [], limit: 20, offset: 0 } }),
  );
}

test("shows the channel row with follower count and a Follow affordance", async ({ page }) => {
  await mockWatch(page, [ethAddress(true)]);
  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  // The channel row links to the channel and shows the real follower count.
  const channelLink = page.getByRole("link", { name: /Grade House/ });
  await expect(channelLink.first()).toHaveAttribute("href", "/channels/grade-house");
  await expect(page.getByText("48.2K followers")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to follow" })).toBeVisible();
});

test("Support opens a dialog with the QR, mono address, and verified pill", async ({ page }) => {
  await mockWatch(page, [ethAddress(true)]);
  await page.goto("/videos/v1");

  const support = page.getByRole("button", { name: "Support" });
  await expect(support).toBeVisible();
  await support.click();

  const dialog = page.getByRole("dialog", { name: "Support Grade House" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(ETH_ADDRESS)).toBeVisible();
  await expect(dialog.getByRole("img", { name: /donation address QR/i })).toBeVisible();
  await expect(dialog.getByText("Verified")).toBeVisible();
  await expect(dialog.getByText(/never holds or processes funds/i)).toBeVisible();
});

test("no Support affordance when the creator exposes no address", async ({ page }) => {
  await mockWatch(page, []);
  await page.goto("/videos/v1");

  await expect(page.getByRole("heading", { name: "Watch Me" })).toBeVisible();
  // The channel row still renders; Support does not (nothing to support with).
  await expect(page.getByText("48.2K followers")).toBeVisible();
  await expect(page.getByRole("button", { name: "Support" })).toHaveCount(0);
});
