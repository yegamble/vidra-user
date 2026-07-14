import { expect, test } from "@playwright/test";

import { API_URL, registerUser } from "./fixtures";

// Backend-backed proof of the Bluesky (ATProto) cross-posting connection against
// a real vidra-core: a creator links their Bluesky account from
// /settings/connections, the backend verifies the app password against the live
// PDS and stores the sealed credential, a fresh API read confirms the linked
// account persisted (and NEVER leaks the app password), and unlinking removes it.
//
// SKIPPED by default and NEVER part of `npm run ci` or the default
// `npm run e2e:backed`: linking hits a LIVE Bluesky PDS to verify credentials
// (com.atproto.server.createSession) — there is no PDS in CI. Opt in explicitly
// with the instance started with the ATProto extension enabled (vidra-core
// ATPROTO_ENABLED=true) and REAL throwaway Bluesky app-password credentials
// supplied via env (never committed):
//
//   E2E_ATPROTO=true \
//   E2E_ATPROTO_HANDLE=you.bsky.social \
//   E2E_ATPROTO_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx \
//   npm run e2e:backed
//
// Use a Bluesky APP PASSWORD (Settings -> App Passwords), not your main password.
// Without E2E_ATPROTO=true this is a no-op skip, so the backed suite stays green
// on a stack that doesn't run the ATProto extension.
const ATPROTO_ENABLED = process.env.E2E_ATPROTO === "true";
const HANDLE = process.env.E2E_ATPROTO_HANDLE ?? "";
const APP_PASSWORD = process.env.E2E_ATPROTO_APP_PASSWORD ?? "";
const ATPROTO = /\/api\/v1\/me\/atproto(\?|$)/;

test.describe("Bluesky cross-posting connection (backed)", () => {
  test.skip(!ATPROTO_ENABLED, "set E2E_ATPROTO=true with an ATProto-enabled backed stack");

  test("a creator links a Bluesky account, it persists, and unlinking removes it", async ({
    page,
    request,
  }) => {
    test.skip(
      HANDLE === "" || APP_PASSWORD === "",
      "set E2E_ATPROTO_HANDLE and E2E_ATPROTO_APP_PASSWORD to real Bluesky app-password credentials",
    );

    // Register via the API to obtain a token for the persistence read, then sign
    // in through the UI (the session lives in memory).
    const user = await registerUser(request, "bsky");
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("supersecret-e2e");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

    // Settings -> Connected accounts (client-side nav keeps the session).
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Manage connected accounts" }).click();
    await expect(page.getByRole("heading", { name: "Connected accounts" })).toBeVisible();

    // Link — the backend verifies the app password against the live PDS.
    await page.getByLabel("Bluesky handle").fill(HANDLE);
    await page.getByLabel("App password").fill(APP_PASSWORD);
    const linked = page.waitForResponse(
      (r) => ATPROTO.test(r.url()) && r.request().method() === "PUT" && r.ok(),
    );
    await page.getByRole("button", { name: "Connect Bluesky" }).click();
    await linked;

    // The linked status view renders (a just-linked account has never posted).
    await expect(page.getByText("No videos announced yet")).toBeVisible();

    // Persistence: a fresh API read (the viewer's own token) returns the linked
    // account with a resolved DID and the chosen auto-post flag — and NEVER the
    // app password (it is sealed, write-only).
    const statusRes = await request.get(`${API_URL}/api/v1/me/atproto`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(statusRes.ok()).toBeTruthy();
    const body = (await statusRes.json()) as { did: string; auto_post: boolean };
    expect(body.did).toMatch(/^did:/);
    expect(body.auto_post).toBe(true);
    expect(JSON.stringify(body)).not.toContain(APP_PASSWORD);

    // Unlink (arm, then confirm) → awaited DELETE → back to the connect form.
    const unlinked = page.waitForResponse(
      (r) => ATPROTO.test(r.url()) && r.request().method() === "DELETE" && r.ok(),
    );
    await page.getByRole("button", { name: "Unlink" }).click(); // arm
    await page.getByRole("button", { name: "Unlink" }).click(); // confirm
    await unlinked;
    await expect(page.getByLabel("Bluesky handle")).toBeVisible();

    // Persistence: the fresh read now 404s (nothing linked).
    const afterRes = await request.get(`${API_URL}/api/v1/me/atproto`, {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(afterRes.status()).toBe(404);
  });
});
