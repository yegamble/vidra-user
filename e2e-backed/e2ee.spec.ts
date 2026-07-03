import { expect, test, type Page } from "@playwright/test";

import {
  encryptedEnvelopes,
  e2eeDevices,
  messagesStatus,
  myE2EEDevices,
  postEncryptedEnvelope,
  registerUser,
  seedComment,
  seedPublishedChannel,
  uniqueId,
} from "./fixtures";

// REAL-CRYPTO backed proof (WRITE-ONLY — not part of `npm run ci`; run with the
// backend-backed profile against a live vidra-core + PostgreSQL and the real
// @matrix-org/olm WASM served from /olm). Two browser contexts (A and B) each
// with their own Olm account + IndexedDB exchange a genuinely encrypted DM:
//   1. A and B each set up a device (first encrypted use) — real key upload.
//   2. A sends an encrypted message; B reads the PLAINTEXT after a reload.
//   3. The server holds ONLY ciphertext: B's own envelope fetch shows the blob is
//      not the plaintext, and a THIRD account's list-messages is 404.
//   4. A disappearing (short-TTL) envelope vanishes from B's reads after its TTL.
//
// Run (see .ralph/AGENT.md): stand up the core stack, build the frontend against
// it (so /olm is served), then `E2E_API_URL=http://localhost:8080 npm run e2e:backed`.

const PASSWORD = "supersecret-e2e";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("two real Olm devices exchange an encrypted DM; the server holds only ciphertext; disappearing messages expire", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);

  // Seed a published video + a comment by B so A can start an encrypted thread
  // from B's comment. Register B, and a third uninvolved account C.
  const { videoId, videoTitle } = await seedPublishedChannel(request);
  const b = await registerUser(request, "bob");
  const a = await registerUser(request, "ada");
  const c = await registerUser(request, "carol");
  const bComment = `enc-me-${uniqueId()}`;
  await seedComment(request, videoId, b.token, bComment);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // --- A: sign in, start an ENCRYPTED conversation with B from B's comment, set
  // up A's device (first encrypted use).
  await login(pageA, a.email);
  await pageA.getByRole("heading", { name: videoTitle }).click();
  await expect(pageA.getByText(bComment)).toBeVisible();
  await pageA
    .locator("li", { hasText: bComment })
    .getByRole("button", { name: "Encrypted message" })
    .click();
  await expect(pageA).toHaveURL(/\/messages\/[0-9a-f-]+\?to=/);
  const conversationId = pageA.url().match(/\/messages\/([0-9a-f-]+)/)![1];

  await expect(pageA.getByText("End-to-end encrypted")).toBeVisible();
  await pageA.getByLabel("Device name").fill("Ada laptop");
  await pageA.getByRole("button", { name: "Set up this device" }).click();
  await expect(pageA.getByLabel("Write an encrypted message")).toBeVisible();

  // --- B: sign in, open the conversation from the inbox, set up B's device so A
  // can claim one of B's one-time keys.
  await login(pageB, b.email);
  await pageB.getByRole("link", { name: "Messages" }).first().click();
  await pageB.getByRole("link", { name: /Encrypted conversation/ }).first().click();
  await expect(pageB).toHaveURL(/\/messages\//);
  await expect(pageB.getByText("End-to-end encrypted")).toBeVisible();
  await pageB.getByLabel("Device name").fill("Bob phone");
  await pageB.getByRole("button", { name: "Set up this device" }).click();
  await expect(pageB.getByLabel("Write an encrypted message")).toBeVisible();

  // --- A: send an encrypted message (claims B's OTK, fans out).
  const plaintext = `secret-${uniqueId()}`;
  const sent = pageA.waitForResponse(
    (r) =>
      /\/api\/v1\/conversations\/[^/]+\/messages$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await pageA.getByLabel("Write an encrypted message").fill(plaintext);
  await pageA.getByRole("button", { name: "Send" }).click();
  await sent;

  // --- B: reload the thread → the message decrypts to PLAINTEXT on B's device.
  await pageB.reload();
  await expect(pageB.getByText(plaintext)).toBeVisible();

  // --- Server holds only ciphertext: B's own envelope fetch shows the stored blob
  // is NOT the plaintext.
  const envelopes = await encryptedEnvelopes(request, conversationId, b.token);
  expect(envelopes.length).toBeGreaterThan(0);
  for (const env of envelopes) {
    expect(env.ciphertext).not.toContain(plaintext);
  }

  // --- A THIRD account cannot even list the conversation's messages (404).
  expect(await messagesStatus(request, conversationId, c.token)).toBe(404);

  // --- Disappearing message: seed a short-TTL envelope to B's device (the UI
  // timer floor is 1h, so a 30s expiry is posted directly), then prove it vanishes
  // from B's reads after the TTL.
  const [aDevice] = await myE2EEDevices(request, a.token);
  const [bDevice] = await e2eeDevices(request, b.id, a.token);
  const status = await postEncryptedEnvelope(request, conversationId, a.token, {
    senderDeviceId: aDevice.id,
    recipientDeviceId: bDevice.id,
    ciphertext: `opaque-${uniqueId()}`,
    expiresInSeconds: 30,
  });
  expect(status).toBe(201);

  const beforeExpiry = await encryptedEnvelopes(request, conversationId, b.token);
  expect(beforeExpiry.some((e) => e.expires_at)).toBe(true);

  // Wait past the TTL, then confirm the expiring envelope is gone from B's reads.
  await new Promise((r) => setTimeout(r, 32_000));
  const afterExpiry = await encryptedEnvelopes(request, conversationId, b.token);
  expect(afterExpiry.some((e) => e.expires_at)).toBe(false);
  // A reload no longer shows the expired message (the durable one still decrypts).
  await pageB.reload();
  await expect(pageB.getByText(plaintext)).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
