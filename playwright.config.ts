import { defineConfig, devices } from "@playwright/test";

// Smoke/e2e config. The `webServer` build output is served by `next start`; the
// `ci` script runs `next build` before `playwright test`.
//
// Two projects:
//   - `chromium` (./e2e)         — mocked smoke tests (page.route); the default,
//                                  fast, no backend. This is what `npm run ci` runs.
//   - `backend-backed` (./e2e-backed) — data-effect verification against a REAL
//                                  vidra-core + Postgres (no mocks). Run explicitly
//                                  via `npm run e2e:backed` with the core stack up
//                                  and the app built against it — see .ralph/AGENT.md.
//                                  Never part of `npm run ci`.
// The dev/test server port. Defaults to 3000 (what CI and the AGENT.md docs use);
// override with E2E_PORT when 3000 is taken locally (e.g. another project's server).
const PORT = process.env.E2E_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The backend-backed suite is signup/auth-heavy against a real stack; under CI
  // resource load an occasional assertion (e.g. the post-signup "Sign out")
  // races the 5s default. Two retries + a 10s expect timeout absorb that load
  // flakiness without masking real defects (specs pass reliably locally).
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", testDir: "./e2e", use: { ...devices["Desktop Chrome"] } },
    {
      // Runs first (as a dependency of backend-backed): seeds the deterministic
      // admin account. Only the *.setup.ts file; never part of `npm run ci`.
      name: "backed-setup",
      testDir: "./e2e-backed",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "backend-backed",
      testDir: "./e2e-backed",
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["backed-setup"],
      // Always capture a trace — it is the persistence evidence for the
      // data-mutating flows the frontend rule requires.
      use: { ...devices["Desktop Chrome"], trace: "on" },
    },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: BASE_URL,
    // The mocked Chromium suite intercepts browser requests only. Keep server
    // component reads deterministically backend-less so the streamed feed/watch
    // fallbacks reach those route mocks even when a developer happens to have
    // vidra-core running on :8080. Backend-backed runs supply E2E_API_URL and
    // therefore point server reads at the real stack.
    env: {
      INTERNAL_API_BASE_URL: process.env.E2E_API_URL ?? "http://127.0.0.1:1",
      // Playwright merges this over the parent environment, so pin the site
      // origin empty instead of merely leaving it unset: a developer with
      // PUBLIC_BASE_URL exported (say while driving a compose stack) would
      // otherwise flip proxy.ts's HSTS branch and fail
      // e2e/security-headers.spec.ts for reasons that have nothing to do with
      // the code under test. Empty is the unconfigured default.
      PUBLIC_BASE_URL: "",
    },
    // Always start a FRESH `next start` against the just-built output and never
    // adopt whatever already holds the port. CI already ran this way
    // (`!process.env.CI` === false under CI), so this is CI-semantics-preserving;
    // the change is purely local. The W1 audit flagged the old
    // `reuseExistingServer: !process.env.CI` as a footgun: locally it would
    // silently reuse a stale `next start` — or worse a `next dev` server — on the
    // port, so `npm run ci`'s e2e/axe gate ran against stale (or unbuilt) code and
    // masked real results. With reuse off, an occupied port fails the run loudly
    // (set E2E_PORT to a free port — see AGENT.md) instead of quietly masking.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
