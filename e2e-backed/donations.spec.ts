import { expect, test } from "@playwright/test";

import {
  channelDonationAddresses,
  createChannel,
  loginToken,
  meId,
  myDonationAddresses,
  uniqueId,
  userDonationAddresses,
} from "./fixtures";

// Proves the P13 donation-address CRUD persists against a real vidra-core +
// PostgreSQL and shows up on the PUBLIC channel/user reads: a user adds an
// account-level and a channel-scoped address through /settings/donations; both
// are read back through the API (the donation_addresses rows), the public
// channel/user reads surface them, one is deleted through the UI (gone from the
// DB), and the survivor persists across a hard reload (refetched, not optimistic).
//
// NON-CUSTODIAL / display-only: no funds, balances, or payments anywhere.

// Valid, well-known example addresses (the backend enforces per-network format).
const ETH = "0x52908400098527886E0F7030069857D2E4169EE7";
const BTC = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2";

test("donation addresses persist, show on public reads, and survive delete + reload", async ({
  page,
  request,
  browser,
}) => {
  const id = uniqueId();
  const username = `don${id}`;
  const email = `e2e-don-${id}@example.test`;
  const password = "supersecret-e2e";
  const handle = `donch${id}`;

  // Sign up through the UI (session lives in memory + the refresh cookie).
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Seed a channel via the API so the scope select can target it.
  const token = await loginToken(request, email, password);
  const userId = await meId(request, token);
  await createChannel(request, token, handle, `Donate ${id}`);

  // Settings → Donation addresses (client-side nav keeps the in-memory session).
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Manage donation addresses" }).click();
  await expect(page.getByRole("heading", { name: "Donation addresses" })).toBeVisible();

  // Add an account-level (profile) Ethereum address. The DR redesign collapses
  // the add-address form behind a dashed "Add address" disclosure button, so
  // open it before filling the fields; the form's own submit is "Save address".
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByLabel("Network").selectOption("ethereum");
  await page.getByLabel("Wallet address").fill(ETH);
  await page.getByLabel(/^Label/).fill("Profile tips");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(ETH)).toBeVisible();
  await expect(page.getByText("Unverified", { exact: true })).toBeVisible();

  // Add a channel-scoped Bitcoin address. A successful add closes the form back
  // to the dashed button, so reopen the disclosure for the second address.
  await page.getByRole("button", { name: "Add address" }).click();
  await page.getByLabel("Network").selectOption("bitcoin");
  await page.getByLabel("Wallet address").fill(BTC);
  await page.getByLabel(/^Label/).fill("Channel tips");
  // Option 0 is "Your profile"; option 1 is the seeded channel.
  await page.getByLabel("Show on").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText(BTC)).toBeVisible();

  // Persisted: the API read shows BOTH rows for the owner.
  const rows = await myDonationAddresses(request, token);
  expect(rows.map((r) => r.address).sort()).toEqual([ETH, BTC].sort());
  const btcRow = rows.find((r) => r.address === BTC);
  const ethRow = rows.find((r) => r.address === ETH);
  expect(btcRow?.channel_id).toBeTruthy(); // channel-scoped
  expect(ethRow?.channel_id).toBeFalsy(); // account-level
  expect(ethRow?.verified).toBe(false);

  // Public reads: the channel read shows the channel-scoped BTC; the user read
  // shows the account-level ETH (channel-scoped addresses are excluded there).
  const chanPublic = await channelDonationAddresses(request, handle);
  expect(chanPublic.map((r) => r.address)).toContain(BTC);
  const userPublic = await userDonationAddresses(request, userId);
  expect(userPublic.map((r) => r.address)).toContain(ETH);

  // The public support affordance (DR5 redesign: a heart "Support" pill — the old
  // "Donate" button) opens a dialog listing each public address as copy-friendly
  // mono TEXT (no longer a read-only <input>). The Follow/Support/Message cluster
  // is intentionally hidden on your OWN channel, so verify it as an anonymous
  // visitor in a fresh browser context — leaving the owner's session on `page`
  // untouched for the delete step below.
  const origin = new URL(page.url()).origin;
  const visitor = await browser.newContext({ baseURL: origin });
  try {
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/channels/${handle}`);
    await visitorPage.getByRole("button", { name: "Support" }).click();
    const dialog = visitorPage.getByRole("dialog", { name: `Support Donate ${id}` });
    await expect(dialog.getByText(BTC)).toBeVisible();
  } finally {
    await visitor.close();
  }

  // Delete the account-level address through the UI.
  await page.goto("/settings/donations");
  await page.getByRole("button", { name: /Delete Ethereum/ }).click();
  await expect(page.getByText(ETH)).toHaveCount(0);

  // Persisted deletion: only the channel-scoped BTC remains in the DB.
  const afterDelete = await myDonationAddresses(request, token);
  expect(afterDelete.map((r) => r.address)).toEqual([BTC]);

  // Fresh load: the refresh cookie restores the session and the page refetches —
  // the survivor is still there (from the server, not optimistic state).
  await page.reload();
  await expect(page.getByText(BTC)).toBeVisible();
  await expect(page.getByText(ETH)).toHaveCount(0);
});
