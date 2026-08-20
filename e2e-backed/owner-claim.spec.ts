import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  API_URL,
  OWNER_CLAIM_TOKEN,
} from "./fixtures";

// The first-run owner claim against a REAL vidra-core.
//
// ORDERING NOTE, and the reason most of this file asserts the claimed side of
// the flow: the `backed-setup` project runs `ensureAdmin` before any spec in
// this suite, and on a fresh stack that bootstrap IS a claim (it redeems the
// fixed OWNER_CLAIM_TOKEN at POST /api/v1/setup/claim-owner). By the time these
// tests run, the server therefore has an owner — that is the whole point of the
// setup project, and re-entering first run would mean tearing the database out
// from under every other backed spec.
//
// So the split is:
//   - the wizard's happy path is pinned by the route-mocked suite
//     (e2e/owner-claim.spec.ts), which can stage first run freely, and by the
//     component tests; the walkthrough below still runs verbatim on the rare
//     stack that reaches this file unclaimed;
//   - what only a live backend can prove is asserted unconditionally here: that
//     `owner_claim_pending` really flips to false after a claim, that a spent
//     setup token really answers 403 `owner_claim_invalid` (the exact code the
//     wizard's rotation copy branches on), and that the frontend really closes
//     the wizard on a claimed server.
//
// The mocked suite cannot catch drift in any of those three — they are backend
// answers, not UI behavior.

/** GET /api/v1/instance — the first-run signal, straight from the backend. */
async function ownerClaimPending(request: APIRequestContext): Promise<boolean> {
  const res = await request.get(`${API_URL}/api/v1/instance`);
  expect(res.ok()).toBe(true);
  const doc = (await res.json()) as { owner_claim_pending?: boolean };
  return doc.owner_claim_pending === true;
}

test("the instance document reports the server has an owner once it is claimed", async ({
  request,
}) => {
  // ensureAdmin claimed it in the setup project; the field the whole feature
  // routes on must reflect that.
  expect(await ownerClaimPending(request)).toBe(false);
});

test("a spent setup token answers the code the wizard explains", async ({ request }) => {
  test.skip(
    await ownerClaimPending(request),
    "this stack has not been claimed yet — nothing has spent the token",
  );
  const res = await request.post(`${API_URL}/api/v1/setup/claim-owner`, {
    data: {
      token: OWNER_CLAIM_TOKEN,
      username: `late${Date.now()}`,
      email: `late${Date.now()}@example.test`,
      password: "another-supersecret",
    },
  });
  expect(res.status()).toBe(403);
  const body = (await res.json()) as { error?: { code?: string } };
  // The wizard's "your token rotates on every restart" help hangs off this
  // exact code. If the backend ever renames it, that help silently disappears.
  expect(body.error?.code).toBe("owner_claim_invalid");
});

test("the wizard is closed on a server that already has an owner", async ({ page, request }) => {
  test.skip(await ownerClaimPending(request), "this stack still awaits its owner");
  await page.goto("/setup/claim");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Setup token")).toHaveCount(0);
});

test("a claimed server shows no first-run card on the account-entry pages", async ({
  page,
  request,
}) => {
  test.skip(await ownerClaimPending(request), "this stack still awaits its owner");
  for (const path of ["/", "/login", "/signup"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "This server is waiting for its owner" }),
    ).toHaveCount(0);
  }
});

test("the wizard claims the server and signs the owner in", async ({ page, request }) => {
  test.skip(
    !(await ownerClaimPending(request)),
    "this stack already has an owner (the backed-setup project claims it first), and " +
      "first run cannot be re-entered without dropping the database",
  );
  // Deliberately the deterministic admin's own credentials: if this path ever
  // does run, it must leave the suite with exactly the account every other
  // backed spec logs in as.
  await page.goto("/setup/claim");
  await page.getByLabel("Setup token").fill(OWNER_CLAIM_TOKEN);
  await page.getByLabel("Username").fill(ADMIN_USERNAME);
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByLabel("Confirm password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  await expect(page.getByRole("heading", { name: "Your server is ready" })).toBeVisible();
  // The session came back with the claim (the login seam), so the owner is
  // already signed in on the very next page — no trip through the login form.
  await page.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // And the backend now reports the flow as finished.
  expect(await ownerClaimPending(request)).toBe(false);
});
