import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY,
  shouldSendHsts,
} from "./security-headers";

describe("global security headers", () => {
  it("keeps CSP report-only and preserves the hls.js blob worker", () => {
    expect(SECURITY_HEADERS.map((header) => header.key)).not.toContain("Content-Security-Policy");
    expect(
      SECURITY_HEADERS.find((header) => header.key === "Content-Security-Policy-Report-Only")
        ?.value,
    ).toBe(CONTENT_SECURITY_POLICY_REPORT_ONLY);
    expect(CONTENT_SECURITY_POLICY_REPORT_ONLY).toContain("worker-src 'self' blob:");
  });

  it("ships the baseline MIME, referrer, and permissions policies", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });

  it("leaves HSTS out of the build-time list — proxy.ts emits it per request", () => {
    expect(SECURITY_HEADERS.map((header) => header.key)).not.toContain(
      "Strict-Transport-Security",
    );
    expect(STRICT_TRANSPORT_SECURITY.value).toBe("max-age=31536000; includeSubDomains");
  });
});

describe("shouldSendHsts", () => {
  // The site origin decides, and every ambiguous answer is "emit": a browser
  // ignores HSTS over plain HTTP anyway, so the only way to get this wrong in a
  // way that hurts is to stay silent on a deployment that really does serve TLS.
  it.each([
    ["unset (no PUBLIC_BASE_URL configured)", undefined, true],
    ["empty (compose passthrough with nothing set)", "", true],
    ["an https origin", "https://vidra.example", true],
    ["an https origin with a port and trailing slash", "https://vidra.example:8443/", true],
    ["a plain-http origin", "http://vidra.example", false],
    ["a plain-http origin on a LAN address", "http://192.168.1.10:3000", false],
    ["a plain-http origin in mixed case", "HTTP://vidra.example", false],
    ["a scheme-less host", "vidra.example", true],
    ["garbage", "not a url at all", true],
  ])("%s → %s", (_label, value, expected) => {
    expect(shouldSendHsts(value)).toBe(expected);
  });
});
