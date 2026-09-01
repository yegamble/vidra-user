import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_URL,
  adminToken,
  blockedInstances,
  registerUser,
  uniqueId,
} from "./fixtures";

// Admin instance blocklist against a REAL vidra-core + PostgreSQL.
//
// WHY BACKED (e2e/moderation-instances.spec.ts already drives the form): the
// mocked spec fulfils every request itself, so three things it "proves" are
// really just its own fixtures read back —
//
//   - the blocked row surviving: AdminInstancesView builds the new row LOCALLY
//     from the form values (no refetch), so the mocked assertion passes even if
//     core never wrote anything. Here the row is re-read from the database
//     after navigating away and back.
//   - the lowercasing of "Spam.Example": the mock asserts the request body the
//     CLIENT sent. The canonical normalisation is instancemod.NormalizeDomain,
//     server-side, and it is what ends up stored.
//   - the 422 on a malformed domain: the mock invents that status. Here core's
//     own validator produces it.
//
// It also pins the authorization boundary the mocked suite cannot reach at all:
// the mocked "anonymous viewers are gated" test proves only that the CLIENT
// declines to fetch. A backed run can ask core directly and see the 403.
//
// KNOWN GAP — deliberately not attempted here. The other half of a block is
// that a blocked instance's content is WITHHELD. That is unprovable on this
// stack, and not for want of trying: the backed compose stack runs with
// FEDERATION_ENABLED unset (it defaults false in vidra-core's config), so the
// ActivityPub inbox routes are not even mounted and remote_videos can never
// acquire a row; and the inbox verifies an HTTP signature against a public key
// fetched from the origin actor, so seeding one needs a signing fake-remote
// instance, not a fixture. e2e-backed/instance-mutes.spec.ts records the same
// blocker for the mute half. Closing it means a compose-level fake-remote
// harness (and federation switched on in frontend-e2e-backed.yml), which is a
// change to the stack, not to a spec file. Until then core's own httptest
// federation suite is the coverage for withholding.

test("a blocked domain is normalised and persisted by core, and unblocking clears it", async ({
  page,
  request,
}) => {
  const token = await adminToken(request);
  // A per-run domain: the backed database is shared with every other spec in
  // the run, so a fixed domain would collide with a retry of this same test.
  const domain = `blocked-${uniqueId()}.example`;
  const mixedCase = domain.toUpperCase();
  const reason = `spam waves ${uniqueId()}`;

  // Precondition: not blocked yet.
  expect((await blockedInstances(request, token)).map((i) => i.domain)).not.toContain(domain);

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Moderation → Instances (client-side nav keeps the in-memory session).
  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Instances" }).click();

  // Block it, typed in the wrong case on purpose.
  await page.getByLabel("Instance domain to block").fill(mixedCase);
  await page.getByLabel("Reason for blocking (optional)").fill(reason);
  const blocked = page.waitForResponse(
    (r) =>
      /\/admin\/instances\/blocked$/.test(r.url()) && r.request().method() === "POST" && r.ok(),
  );
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await blocked;

  // Persisted, lowercased by core, with the reason attached (database read).
  const stored = (await blockedInstances(request, token)).find((i) => i.domain === domain);
  expect(stored).toBeDefined();
  expect(stored?.reason).toBe(reason);

  // …and a FRESH authed fetch of the list renders it. The view appends the new
  // row optimistically, so leaving the page and coming back is what makes this
  // a read of the database rather than of the form that was just submitted.
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Instances" }).click();
  await expect(page.getByText(domain)).toBeVisible();
  await expect(page.getByText(reason)).toBeVisible();

  // Unblock from the UI → the row goes, and the backend row goes with it.
  const unblocked = page.waitForResponse(
    (r) =>
      /\/admin\/instances\/blocked\/[^/]+$/.test(r.url()) &&
      r.request().method() === "DELETE" &&
      r.ok(),
  );
  await page.getByRole("button", { name: `Unblock ${domain}` }).click();
  await unblocked;
  await expect(page.getByText(domain)).toHaveCount(0);

  expect((await blockedInstances(request, token)).map((i) => i.domain)).not.toContain(domain);
});

test("core rejects a malformed domain and refuses the blocklist to a plain user", async ({
  page,
  request,
}) => {
  // A domain the client is willing to submit (it only trims and lowercases)
  // but instancemod.NormalizeDomain refuses — the 422 is core's, not a mock's.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  await page.getByRole("link", { name: "Moderation" }).click();
  await page.getByRole("link", { name: "Instances" }).click();

  await page.getByLabel("Instance domain to block").fill("not a domain");
  const rejected = page.waitForResponse(
    (r) =>
      /\/admin\/instances\/blocked$/.test(r.url()) &&
      r.request().method() === "POST" &&
      r.status() === 422,
  );
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await rejected;
  await expect(
    page.getByText("Enter a valid instance domain (a bare hostname, optionally host:port)."),
  ).toBeVisible();

  // The blocklist is moderator-only in CORE, not merely behind the client's
  // RoleGate: a plain account's token is refused outright.
  const user = await registerUser(request, "notmod");
  const res = await request.get(`${API_URL}/api/v1/admin/instances/blocked`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  expect(res.status()).toBe(403);
});
