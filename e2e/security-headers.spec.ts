import { expect, test } from "@playwright/test";

// Intent changed (owner-approved): the CSP is ENFORCED with a per-request nonce,
// so every spec in this suite now runs under it.
test("responses enforce the nonce CSP and baseline hardening headers", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  const csp = headers["content-security-policy"];
  expect(headers["content-security-policy-report-only"]).toBeUndefined();
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(csp).toContain("worker-src 'self' blob:");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(headers["reporting-endpoints"]).toBe('csp="/csp-report"');
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();
});

// HSTS moved out of next.config into proxy.ts, so this asserts the
// DEFAULT-configuration branch: the webServer runs with PUBLIC_BASE_URL unset,
// which is the fail-secure "emit anyway" case (a browser ignores the header
// over plain http, so the served scheme here proves nothing either way). The
// scheme-conditional half — an http:// origin suppressing it — is covered by
// the pure predicate's table test in lib/security-headers.test.ts rather than
// by standing up a second server just to flip one environment variable.
test("HSTS is emitted for the default (unconfigured origin) deployment", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  expect(response.headers()["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains",
  );
});

// The next.config rule this replaced applied to `/:path*` — every route, /embed
// included. The proxy matcher has to keep that reach, so prove it on a route
// outside the app shell.
test("HSTS reaches the embed routes the old next.config rule covered", async ({ request }) => {
  const response = await request.get("/embed/v1");
  expect(response.headers()["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains",
  );
  // Embeds exist to be framed by any site.
  expect(response.headers()["content-security-policy"]).not.toContain("frame-ancestors");
});
