import { expect, test } from "@playwright/test";

import {
  adminToken,
  API_URL,
  ipfsStatus,
  registerUser,
  seedPublishedChannel,
  sendDirectMessage,
  TINY_PNG_BASE64,
  uniqueId,
  waitForHls,
  waitForIpfsPin,
  type IpfsStatus,
} from "./fixtures";

// PRIVACY INVARIANT — a NEGATIVE test, guarding a deliberate refusal.
//
// vidra-core never mirrors direct-message attachments to IPFS. Two files own
// that decision and this spec exists so a change to either one fails loudly from
// OUTSIDE the Go process, where until now it was asserted only by unit tests:
//
//   vidra-core/internal/ipfsmirror/classes.go:52-55 — ClassDMAttachment sits in
//     the never-mirror block ("Never public; if ever replicated it must be via a
//     private cluster and coordinated with the Messaging v2 spec").
//   vidra-core/internal/ipfsmirror/eligibility.go — Route() is DEFAULT-DENY, so
//     dm_attachment falls through to `return NetworkNone`: refused on BOTH the
//     public and the private swarm, not merely kept off the public one.
//
// A permanent content-addressed CID for a participant-gated attachment would be
// unrevocable: anyone who learned the CID could fetch the bytes forever, with no
// participant check and no way to unpublish. That is why this is a fence and not
// a feature flag, and why "make DM attachments mirror-eligible" must never be a
// quiet one-line change.
//
// HOW IT FAILS IF THE FENCE BREAKS. `by_class` on GET /api/v1/ipfs/status is a
// GROUP BY over the pin ledger, so a class appears there ONLY once a row was
// written for it. `dm_attachment` appearing at all — in any state, on either
// swarm — means something enqueued one. The same holds for the reconcile
// scanner's `by_class`, which is exercised here too: the fence has to hold on
// the write path AND on the catalogue backfill that walks every stored object.
//
// SCOPE. There is deliberately no positive "private pinning for messaging" test
// to pair with this: that feature does not exist, and the private tier ships no
// gateway at all (vidra-core/docker-compose.yml records "deliberately NO
// IPFS_PRIVATE_GATEWAY_URL knob" — replication, not distribution), so a private
// CID has no viewer-facing surface to test.

/** This class's tally in a status `by_class` list, or null when the class is absent. */
function classCounts(list: IpfsStatus["by_class"], mediaClass: string) {
  return list.find((c) => c.media_class === mediaClass) ?? null;
}

/** Every place a status payload reports per-class tallies (folded + both swarms). */
function everyClassList(status: IpfsStatus): Array<[string, IpfsStatus["by_class"]]> {
  return [
    ["by_class (folded across swarms)", status.by_class],
    ["networks.public.by_class", status.networks.public.by_class],
    ["networks.private.by_class", status.networks.private.by_class],
  ];
}

function expectNoDMAttachmentPins(status: IpfsStatus, when: string) {
  for (const [where, list] of everyClassList(status)) {
    expect(
      classCounts(list, "dm_attachment"),
      `${when}: a dm_attachment pin ledger row exists in ${where} — the never-mirror ` +
        "fence (vidra-core internal/ipfsmirror/classes.go + eligibility.go Route) has been " +
        "breached; a DM attachment must route to NetworkNone on BOTH swarms",
    ).toBeNull();
  }
}

test("a DM attachment is never mirrored to IPFS, on either swarm", async ({ page, request }) => {
  // Seeding a real video means a real transcode + a real (jittered) pin drain.
  test.setTimeout(360_000);

  const admin = await adminToken(request);

  // POSITIVE CONTROL 1 — the mirror is genuinely ON in this run. Without it the
  // negative assertion below would pass trivially on a stack with IPFS off.
  const initial = await ipfsStatus(request, admin);
  expect(initial.enabled, "IPFS mirror is off — start this job with IPFS_ENABLED=true").toBe(true);
  expect(initial.node_reachable, "the kubo node is unreachable from the api").toBe(true);
  expect(initial.networks.public.enabled).toBe(true);
  expectNoDMAttachmentPins(initial, "before anything was seeded");

  // POSITIVE CONTROL 2 — this instance really does pin eligible media. A public
  // published video's HLS tree gets a CID, so "nothing was pinned at all" cannot
  // masquerade as "the DM attachment was refused".
  const { videoId } = await seedPublishedChannel(request);
  await waitForHls(request, videoId);
  await waitForIpfsPin(request, videoId);

  const before = await ipfsStatus(request, admin);
  const publicHls = classCounts(before.networks.public.by_class, "hls");
  expect(publicHls?.pinned ?? 0, "no HLS tree is pinned — the mirror is not working here").toBeGreaterThan(0);
  expectNoDMAttachmentPins(before, "before the DM attachment was sent");

  // Now the subject: a REAL direct message with a REAL attachment, uploaded
  // through the composer in the browser (the same upload → send → render flow
  // e2e-backed/messaging.spec.ts covers), on an IPFS-enabled stack.
  const sender = await registerUser(request, "dms");
  const recipient = await registerUser(request, "dmr");
  const opener = `fence-${uniqueId()}`;
  const conversationId = await sendDirectMessage(request, sender.token, recipient.id, opener);

  await page.goto("/login");
  await page.getByLabel("Email").fill(sender.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Client-side navigation only — the session lives in memory, so a full page
  // load would drop it (the idiom every messaging backed spec uses).
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByText(opener).click();
  await expect(page).toHaveURL(new RegExp(`/messages/${conversationId}$`));

  const filename = `fence-${uniqueId()}.png`;
  const uploaded = page.waitForResponse(
    (r) =>
      /\/conversations\/[^/]+\/attachments$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.ok(),
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
  });
  await uploaded;
  await expect(page.getByText(filename)).toBeVisible();

  const sent = page.waitForResponse(
    (r) =>
      /\/conversations\/[^/]+\/messages$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Send" }).click();
  await sent;
  // The attachment really did land — otherwise there would be nothing to refuse.
  await expect(page.getByRole("img", { name: filename })).toBeAttached();

  // Give a hypothetical mirror hook every chance to write a ledger row: the drain
  // worker ticks every 10s, so watch across several ticks rather than sampling
  // once immediately after the send.
  const watchUntil = Date.now() + 40_000;
  for (;;) {
    expectNoDMAttachmentPins(await ipfsStatus(request, admin), "after the DM attachment was sent");
    if (Date.now() > watchUntil) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }

  // The OTHER path into the ledger: the admin reconcile walks the whole catalogue
  // and seeds pin intents for every eligible already-public object. Every
  // candidate is supposed to pass the same eligibility gate, so the scanner must
  // refuse the attachment too — a fence that held only on the write path would
  // still leak the bytes the first time an operator pressed "reconcile".
  const reconcile = await request.post(`${API_URL}/api/v1/admin/ipfs/reconcile`, {
    headers: { Authorization: `Bearer ${admin}` },
  });
  expect(reconcile.status()).toBe(202); // 202 Accepted — the scan is enqueue-only.
  const result = (await reconcile.json()) as { enqueued: number; by_class: Record<string, number> };
  expect(
    Object.keys(result.by_class),
    "the reconcile scanner enqueued a dm_attachment — the catalogue backfill must apply " +
      "the same never-mirror fence as the write path",
  ).not.toContain("dm_attachment");

  // ...and the ledger still has no dm_attachment row after the scan settles.
  expectNoDMAttachmentPins(await ipfsStatus(request, admin), "after an admin reconcile");
});
