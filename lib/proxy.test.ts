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

// The allowances are read from the container environment per request; with none
// set the response must carry the strict policy, not a widened one.
describe("proxy CSP operator allowances", () => {
  const csp = () => run("/").headers.get("content-security-policy") ?? "";
  it("adds nothing by default", () => {
    const policy = csp();
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("frame-src");
    expect(policy).not.toContain("script-src-attr");
  });
  it("applies each allowance set in the environment", () => {
    vi.stubEnv("CSP_ALLOW_EVAL", "true");
    vi.stubEnv("CSP_FRAME_SRC", "https:");
    vi.stubEnv("CSP_ALLOW_INLINE_EVENT_HANDLERS", "true");
    const policy = csp();
    expect(policy).toMatch(/script-src [^;]*'unsafe-eval';/);
    expect(policy).toContain("frame-src 'self' https:");
    expect(policy).toContain("script-src-attr 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'self'");
  });
});

// Reverting proxy.ts to an /embed-only check blanks every migrated PeerTube
// iframe (the redirect hop would say frame-ancestors 'self'), and nothing else
// would notice.
describe("proxy frame-ancestors on legacy paths", () => {
  const csp = (path: string) => run(path).headers.get("content-security-policy") ?? "";
  it("leaves PeerTube's legacy embed paths frameable", () => {
    for (const p of ["/videos/embed/x", "/video-playlists/embed/x"]) {
      expect(csp(p), p).not.toContain("frame-ancestors");
    }
  });
  it("keeps other legacy paths self-framing only", () => {
    for (const p of ["/videos/watch/x", "/w/abc", "/videos/embedx"]) {
      expect(csp(p), p).toContain("frame-ancestors 'self'");
    }
  });
});
