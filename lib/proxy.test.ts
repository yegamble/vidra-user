import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Lives in lib/ because vitest only collects lib/, app/ and components/.
import { proxy } from "@/proxy";

const run = (path: string) => proxy(new NextRequest(`http://vidra.test${path}`));

afterEach(() => vi.unstubAllEnvs());

describe("proxy CSP", () => {
  it("enforces a fresh nonce per request and hands it to the render", () => {
    const a = run("/");
    const b = run("/");
    const policy = a.headers.get("content-security-policy") ?? "";
    const nonce = a.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{16,}$/);
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(b.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
    // Next reads the nonce for its own scripts from the REQUEST policy header.
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(policy).toContain("frame-ancestors 'self'");
    expect(run("/embed/v1").headers.get("content-security-policy")).not.toContain("frame-anc");
  });

  it("reports instead of enforcing under CSP_REPORT_ONLY=true", () => {
    vi.stubEnv("CSP_REPORT_ONLY", "true");
    const res = run("/");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("content-security-policy-report-only")).toContain("'nonce-");
  });
});
