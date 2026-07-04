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
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Seed a channel via the API so the scope select can target it.
  const token = await loginToken(request, email, password);
  const userId = await meId(request, token);
  await createChannel(request, token, handle, `Donate ${id}`);

  // Settings → Donation addresses (client-side nav keeps the in-memory session).
  await page.getByRole("link", { name: username }).click();
  await page.getByRole("link", { name: "Manage donation addresses" }).click();
  await expect(page.getByRole("heading", { name: "Donation addresses" })).toBeVisible();

  // Add an account-level (profile) Ethereum address.
  await page.getByLabel("Network").selectOption("ethereum");
  await page.getByLabel("Wallet address").fill(ETH);
  await page.getByLabel(/^Label/).fill("Profile tips");
  await page.getByRole("button", { name: "Add address" }).click();
  await expect(page.getByText(ETH)).toBeVisible();
  await expect(page.getByText("Unverified", { exact: true })).toBeVisible();

  // Add a channel-scoped Bitcoin address.
  await page.getByLabel("Network").selectOption("bitcoin");
  await page.getByLabel("Wallet address").fill(BTC);
  await page.getByLabel(/^Label/).fill("Channel tips");
  // Option 0 is "Your profile"; option 1 is the seeded channel.
  await page.getByLabel("Show on").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add address" }).click();
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

  // The public "Donate" affordance renders on the channel page and lists the address.
  await page.goto(`/channels/${handle}`);
  await page.getByRole("button", { name: "Donate" }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`Donate to Donate ${id}`) });
  // The dialog lists each address in a read-only, copy-friendly <input>, so the
  // address is the field's VALUE (not text) — assert on the labelled textbox.
  await expect(dialog.getByRole("textbox", { name: /Bitcoin.*address/ })).toHaveValue(BTC);
  await page.getByRole("button", { name: "Close" }).click();

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
