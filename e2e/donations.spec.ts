import { expect, test, type Page } from "@playwright/test";

// Mocked P13 donation-address coverage (a real backend is not running in
// `npm run ci`; the persistence round-trip is proven in
// e2e-backed/donations.spec.ts). Clipboard read-back needs explicit permissions.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const LOGIN = /\/api\/v1\/auth\/login$/;
const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const MY_CHANNELS = /\/api\/v1\/me\/channels$/;
const MY_DONATIONS = /\/api\/v1\/me\/donation-addresses$/;
const DELETE_ONE = /\/api\/v1\/me\/donation-addresses\/[^/]+$/;
const CHALLENGE = /\/api\/v1\/me\/donation-addresses\/[^/]+\/challenge$/;
const VERIFY = /\/api\/v1\/me\/donation-addresses\/[^/]+\/verify$/;

const BTC = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";
const ETH = "0x52908400098527886E0F7030069857D2E4169EE7";

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: true,
    display_name: "Ada",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function addr(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    owner_id: "u1",
    network: "bitcoin",
    address: BTC,
    label: "Tips",
    verified: false,
    created_at: new Date().toISOString(),
    ...over,
  };
}

async function signIn(page: Page) {
  await page.route(LOGIN, (route) => route.fulfill({ json: session }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(MY_CHANNELS, (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: "ch1",
            owner_id: "u1",
            handle: "ada",
            display_name: "Ada Makes",
            description: "",
            follower_count: 0,
            created_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email").fill("ada@example.test");
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

// Reach the donations page via settings (client-side nav keeps the in-memory session).
async function openDonations(page: Page) {
  await page.getByRole("link", { name: "ada" }).click();
  await page.getByRole("link", { name: "Manage donation addresses" }).click();
  await expect(page.getByRole("heading", { name: "Donation addresses" })).toBeVisible();
}

test("the donations page prompts anonymous viewers to sign in", async ({ page }) => {
  await page.goto("/settings/donations");
  await expect(page.getByText("Sign in to manage donation addresses")).toBeVisible();
});

test("adding an address makes it appear with an unverified badge", async ({ page }) => {
  await signIn(page);

  let postBody: unknown;
  await page.route(MY_DONATIONS, (route) => {
    if (route.request().method() === "POST") {
      postBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: addr() });
    }
    return route.fulfill({ json: { addresses: [] } });
  });

  await openDonations(page);

  await page.getByLabel("Network").selectOption("bitcoin");
  await page.getByLabel("Wallet address").fill(BTC);
  await page.getByLabel(/^Label/).fill("Tips");
  await page.getByRole("button", { name: "Add address" }).click();

  // The new row shows the address and an Unverified badge.
  await expect(page.getByText(BTC)).toBeVisible();
  await expect(page.getByText("Unverified", { exact: true })).toBeVisible();
  expect(postBody).toEqual({ network: "bitcoin", address: BTC, label: "Tips" });
});

test("a per-network validation error is surfaced before any request", async ({ page }) => {
  await signIn(page);

  let posted = false;
  await page.route(MY_DONATIONS, (route) => {
    if (route.request().method() === "POST") posted = true;
    return route.fulfill({ json: { addresses: [] } });
  });

  await openDonations(page);

  // A bitcoin address entered while Ethereum is selected must not be sent.
  await page.getByLabel("Network").selectOption("ethereum");
  await page.getByLabel("Wallet address").fill(BTC);
  await page.getByRole("button", { name: "Add address" }).click();

  await expect(page.getByText(/does not look like a valid Ethereum/i)).toBeVisible();
  expect(posted).toBe(false);
});

test("the verify flow flips an ethereum address to verified", async ({ page }) => {
  await signIn(page);

  await page.route(MY_DONATIONS, (route) =>
    route.fulfill({
      json: { addresses: [addr({ id: "d9", network: "ethereum", address: ETH, label: "Wallet" })] },
    }),
  );
  await page.route(CHALLENGE, (route) =>
    route.fulfill({
      status: 201,
      json: { message: "Verify ownership of ETH for vidra: nonce-abc", expires_at: new Date(Date.now() + 6e5).toISOString() },
    }),
  );
  let verifyBody: unknown;
  await page.route(VERIFY, (route) => {
    verifyBody = route.request().postDataJSON();
    return route.fulfill({
      json: addr({ id: "d9", network: "ethereum", address: ETH, label: "Wallet", verified: true }),
    });
  });

  await openDonations(page);

  await expect(page.getByText("Unverified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verify ownership" }).click();

  // The message to sign is shown; paste a signature and verify.
  await expect(page.getByText("nonce-abc", { exact: false })).toBeVisible();
  await page.getByLabel("2. Paste the signature").fill("0xdeadbeefsig");
  await page.getByRole("button", { name: "Verify", exact: true }).click();

  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByText("Unverified", { exact: true })).toHaveCount(0);
  expect(verifyBody).toEqual({ signature: "0xdeadbeefsig" });
});

test("an unverified address on an unsupported network shows an honest state", async ({ page }) => {
  await signIn(page);
  await page.route(MY_DONATIONS, (route) =>
    route.fulfill({ json: { addresses: [addr({ id: "d3", network: "monero", address: "4" + "1".repeat(94) })] } }),
  );

  await openDonations(page);

  await expect(page.getByText(/verification is not available for Monero/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify ownership" })).toHaveCount(0);
});

test("deleting an address removes it from the list", async ({ page }) => {
  await signIn(page);
  await page.route(MY_DONATIONS, (route) => route.fulfill({ json: { addresses: [addr()] } }));
  let deleted = false;
  await page.route(DELETE_ONE, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });

  await openDonations(page);

  await expect(page.getByText(BTC)).toBeVisible();
  await page.getByRole("button", { name: /Delete Bitcoin/ }).click();

  await expect(page.getByText("No donation addresses yet")).toBeVisible();
  expect(deleted).toBe(true);
});

// --- Public "Donate" affordance on a channel page ---------------------------

const CH_DETAIL = /\/api\/v1\/channels\/ada$/;
const CH_VIDEOS = /\/api\/v1\/channels\/ada\/videos$/;
const CH_DONATIONS = /\/api\/v1\/channels\/ada\/donation-addresses$/;
const USER_DONATIONS = /\/api\/v1\/users\/u1\/donation-addresses$/;

const channel = {
  id: "ch1",
  owner_id: "u1",
  handle: "ada",
  display_name: "Ada Makes",
  description: "",
  follower_count: 3,
  created_at: new Date().toISOString(),
};

test("the channel Support dialog lists an address and copies it", async ({ page }) => {
  await page.route(CH_DETAIL, (route) => route.fulfill({ json: channel }));
  await page.route(CH_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(CH_DONATIONS, (route) =>
    route.fulfill({
      json: {
        addresses: [
          { id: "c1", owner_id: "u1", channel_id: "ch1", network: "bitcoin", address: BTC, label: "Channel tips", verified: true, created_at: new Date().toISOString() },
        ],
      },
    }),
  );
  await page.route(USER_DONATIONS, (route) => route.fulfill({ json: { addresses: [] } }));

  await page.goto("/channels/ada");

  // The channel header's Support affordance (DR6) opens the shared crypto-donation
  // dialog (QR tile + mono address + verified pill + copy).
  const support = page.getByRole("button", { name: "Support" });
  await expect(support).toBeVisible();
  await support.click();

  const dialog = page.getByRole("dialog", { name: "Support Ada Makes" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Bitcoin (BTC)")).toBeVisible();
  await expect(dialog.getByText(BTC)).toBeVisible();
  await expect(dialog.getByRole("img", { name: /donation address QR/i })).toBeVisible();
  await expect(dialog.getByText("Verified", { exact: true })).toBeVisible();
  // The honesty line is present.
  await expect(dialog.getByText(/never holds or processes funds/i)).toBeVisible();

  await dialog.getByRole("button", { name: /Copy Bitcoin/ }).click();
  await expect(dialog.getByRole("button", { name: /Copy Bitcoin/ })).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(BTC);
});

test("no Support affordance appears when a channel has no addresses", async ({ page }) => {
  await page.route(CH_DETAIL, (route) => route.fulfill({ json: channel }));
  await page.route(CH_VIDEOS, (route) => route.fulfill({ json: { videos: [] } }));
  await page.route(CH_DONATIONS, (route) => route.fulfill({ json: { addresses: [] } }));
  await page.route(USER_DONATIONS, (route) => route.fulfill({ json: { addresses: [] } }));

  await page.goto("/channels/ada");
  await expect(page.getByRole("heading", { name: "Ada Makes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Support" })).toHaveCount(0);
});
