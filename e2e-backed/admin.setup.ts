import { test as setup } from "@playwright/test";

import { ensureAdmin } from "./fixtures";

// Backed-suite setup: ensure a deterministic admin account exists BEFORE any other
// backed test registers a user. On a fresh instance the admin is bootstrapped by
// redeeming the fixed owner-claim token (on cores that predate the owner-claim
// flow: by registering first — see ensureAdmin), so this must run first — it is
// wired as a dependency of the `backend-backed` project (see playwright.config.ts).
// Admin-gated backed tests then log in via `adminToken()` (e.g. to read the
// moderation queue).
setup("ensure a deterministic admin exists", async ({ request }) => {
  await ensureAdmin(request);
});
