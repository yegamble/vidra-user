import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  API_URL,
  adminToken,
  loginStatus,
  registrationRequests,
  uniqueId,
} from "./fixtures";

// Registration-approval round trip against a real vidra-core + PostgreSQL.
//
// GATED: the standard backed stack (frontend-e2e-backed.yml / the local compose
// profile in .ralph/AGENT.md) boots with approval OFF (REGISTRATION_REQUIRE_APPROVAL
// =false), because every other backed spec seeds accounts via POST /auth/register
// and expects an immediate 201 session. Turning approval on instance-wide would
// break that seeding. So this spec only runs when the stack was explicitly booted
// with REGISTRATION_REQUIRE_APPROVAL=true AND the runner sets
// E2E_REGISTRATION_APPROVAL=true (run it as its own job/stack):
//
//   REGISTRATION_REQUIRE_APPROVAL=true docker compose --profile core up -d --build
//   E2E_REGISTRATION_APPROVAL=true E2E_API_URL=http://localhost:8088 npm run e2e:backed -- registration-approval
//
// NOTE: the deterministic admin must already exist (backed-setup registers it
// FIRST on a fresh DB — with approval on, only do this against a DB where the
// admin was seeded before approval was enabled, or approve it manually).
test.skip(
  process.env.E2E_REGISTRATION_APPROVAL !== "true",
  "requires a backend booted with REGISTRATION_REQUIRE_APPROVAL=true (set E2E_REGISTRATION_APPROVAL=true)",
);

test("a signup files a pending request; approving it creates the account", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const username = `appr${id}`;
  const email = `e2e-appr-${id}@example.test`;
  const password = "supersecret-e2e";

  // Sign up through the UI → the awaiting-approval confirmation, no session.
  await page.goto("/signup");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Message to the administrators (optional)").fill(`please approve ${id}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Your account is awaiting approval")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open account menu" })).toHaveCount(0);

  // The request persisted (admin API read) and no account exists yet.
  const token = await adminToken(request);
  const filed = (await registrationRequests(request, token, "pending")).find(
    (r) => r.username === username,
  );
  expect(filed?.status).toBe("pending");
  expect(await loginStatus(request, email, password)).not.toBe(200);

  // The deterministic admin logs in through the UI and opens the queue.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Registration" }).click();
  await expect(page.getByText(email)).toBeVisible();

  // Approve → the row flips in place.
  const approved = page.waitForResponse(
    (r) => /registration-requests\/[^/]+\/approve$/.test(r.url()) && r.ok(),
  );
  await page.getByRole("button", { name: `Approve ${username}` }).click();
  await approved;
  await expect(page.getByText("approved", { exact: true })).toBeVisible();

  // Persisted across a fresh refetch (filter switch re-reads from the backend).
  await page.getByRole("button", { name: "All" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole("button", { name: `Approve ${username}` })).toHaveCount(0);

  // DB effect: the request row flipped AND the account now exists (login 200).
  const resolved = (await registrationRequests(request, token)).find(
    (r) => r.username === username,
  );
  expect(resolved?.status).toBe("approved");
  expect(await loginStatus(request, email, password)).toBe(200);
});

test("rejecting a request records the note and creates no account", async ({ page, request }) => {
  const id = uniqueId();
  const username = `rej${id}`;
  const email = `e2e-rej-${id}@example.test`;
  const password = "supersecret-e2e";

  // File the request via the API (202, no token).
  const reg = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username, email, password },
  });
  expect(reg.status()).toBe(202);

  // The admin rejects it through the UI with an internal note.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Registration" }).click();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel(`Internal note for ${username}`).fill(`spam signup ${id}`);
  const rejected = page.waitForResponse(
    (r) => /registration-requests\/[^/]+\/reject$/.test(r.url()) && r.ok(),
  );
  await page.getByRole("button", { name: `Reject ${username}` }).click();
  await rejected;
  await expect(page.getByText("rejected", { exact: true })).toBeVisible();
  await expect(page.getByText(`spam signup ${id}`)).toBeVisible();

  // DB effect: status flipped to rejected AND no account was created.
  const token = await adminToken(request);
  const resolved = (await registrationRequests(request, token)).find(
    (r) => r.username === username,
  );
  expect(resolved?.status).toBe("rejected");
  expect(await loginStatus(request, email, password)).not.toBe(200);
});
