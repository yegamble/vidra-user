import { describe, expect, it } from "vitest";

import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  SECURITY_HEADERS,
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

  it("ships the baseline transport, MIME, referrer, and permissions policies", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
  });
});
