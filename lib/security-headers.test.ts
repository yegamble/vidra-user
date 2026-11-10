import { describe, expect, it } from "vitest";

import {
  SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY,
  apiOriginOf,
  isFrameablePath,
  buildContentSecurityPolicy,
  cspAllowancesFromEnv,
  shouldSendHsts,
} from "./security-headers";

// Intent changed (owner-approved): the CSP is ENFORCED, built per request in
// proxy.ts around a nonce, instead of a static report-only constant.
describe("buildContentSecurityPolicy", () => {
  const base = { nonce: "abc123", apiOrigin: null, frameable: false, isDev: false };

  it("allows scripts by nonce only (no 'unsafe-inline'), keeps wasm/media/workers", () => {
    expect(buildContentSecurityPolicy(base)).toBe(
      "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; " +
        "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
        "img-src 'self' data: blob: http: https:; media-src 'self' data: blob: http: https:; " +
        "connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:; manifest-src 'self'; " +
        "frame-ancestors 'self'; report-uri /csp-report; report-to csp",
    );
  });

  it("adds a cross-origin API to script-src and style-src for custom.js/css", () => {
    const policy = buildContentSecurityPolicy({ ...base, apiOrigin: "https://api.example" });
    expect(policy).toContain("'wasm-unsafe-eval' https://api.example;");
    expect(policy).toContain("style-src 'self' 'unsafe-inline' https://api.example;");
  });

  it("lets any site frame /embed, and allows eval only in development", () => {
    expect(buildContentSecurityPolicy({ ...base, frameable: true })).not.toContain("frame-ancestors");
    expect(buildContentSecurityPolicy({ ...base, isDev: true })).toContain(" 'unsafe-eval';");
  });
});

// Operator allowances: each switch adds exactly its own source or directive, and
// the default (no allowance) stays the byte-identical strict policy asserted above.
describe("buildContentSecurityPolicy operator allowances", () => {
  const base = { nonce: "abc123", apiOrigin: null, frameable: false, isDev: false };
  const none = { evalScripts: false, inlineEventHandlers: false, frameSources: [] };

  it("changes nothing when every allowance is off", () => {
    expect(buildContentSecurityPolicy({ ...base, allow: none })).toBe(buildContentSecurityPolicy(base));
  });

  it("adds 'unsafe-eval' to script-src only when eval is allowed", () => {
    const policy = buildContentSecurityPolicy({ ...base, allow: { ...none, evalScripts: true } });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval';");
    expect(policy).not.toContain("frame-src");
    expect(policy).not.toContain("script-src-attr");
  });

  it("allows inline event handlers through script-src-attr, never through script-src", () => {
    const policy = buildContentSecurityPolicy({ ...base, allow: { ...none, inlineEventHandlers: true } });
    expect(policy).toContain("; script-src-attr 'unsafe-inline';");
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic' 'wasm-unsafe-eval';");
  });

  it("widens frames to the given sources and keeps frame-ancestors", () => {
    const policy = buildContentSecurityPolicy({ ...base, allow: { ...none, frameSources: ["https:"] } });
    expect(policy).toContain("; frame-src 'self' https:;");
    expect(policy).toContain("frame-ancestors 'self'");
  });
});

describe("cspAllowancesFromEnv", () => {
  it("is all off for an empty environment", () => {
    expect(cspAllowancesFromEnv({})).toEqual({ evalScripts: false, inlineEventHandlers: false, frameSources: [] });
  });

  it("switches on only for the literal true", () => {
    expect(cspAllowancesFromEnv({ CSP_ALLOW_EVAL: "true", CSP_ALLOW_INLINE_EVENT_HANDLERS: "1" })).toMatchObject({
      evalScripts: true,
      inlineEventHandlers: false,
    });
    expect(cspAllowancesFromEnv({ CSP_ALLOW_INLINE_EVENT_HANDLERS: "true" }).inlineEventHandlers).toBe(true);
  });

  it("keeps https frame sources and drops everything else", () => {
    const { frameSources } = cspAllowancesFromEnv({
      CSP_FRAME_SRC: "https:  https://ads.example https://*.ads.example:8443 http: * 'unsafe-inline' data: http://plain.example",
    });
    expect(frameSources).toEqual(["https:", "https://ads.example", "https://*.ads.example:8443"]);
  });

  // The value lands inside a response header: it must not be able to end the
  // directive and start another one.
  it("cannot be used to inject a directive", () => {
    expect(cspAllowancesFromEnv({ CSP_FRAME_SRC: "https:; script-src * 'unsafe-inline'" }).frameSources).toEqual([]);
    expect(cspAllowancesFromEnv({ CSP_FRAME_SRC: "https://a.example;script-src,*" }).frameSources).toEqual([]);
  });
});

describe("apiOriginOf", () => {
  it.each([
    ["same-origin (empty)", "", null],
    ["a cross-origin API with a path", "https://api.example:8443/base", "https://api.example:8443"],
    ["a non-http scheme", "javascript:alert(1)", null],
  ])("%s", (_label, value, expected) => {
    expect(apiOriginOf(value)).toBe(expected);
  });
});

describe("global security headers", () => {
  it("leaves the CSP out of the build-time list — proxy.ts sets it per request", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key as string);
    expect(keys).not.toContain("Content-Security-Policy");
    expect(keys).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("declares the report-to endpoint group the per-request policy names", () => {
    expect(SECURITY_HEADERS.find((h) => h.key === "Reporting-Endpoints")?.value).toBe(
      'csp="/csp-report"',
    );
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

describe("isFrameablePath", () => {
  it("frames /embed and PeerTube's legacy embed paths only", () => {
    for (const p of ["/embed/x", "/videos/embed/x", "/video-playlists/embed/x"]) expect(isFrameablePath(p)).toBe(true);
    for (const p of ["/embedded", "/videos/watch/x", "/videos/embedx", "/"]) expect(isFrameablePath(p)).toBe(false);
  });
});
