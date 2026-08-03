import { describe, expect, it } from "vitest";

import { clientIpForwardHeaders, trustedForwardedSuffix } from "./client-ip.server";

// The suffix rule is the security-relevant half: vidra-core reads the chain
// right-to-left and discards the WHOLE header the moment one entry fails to
// parse, so the client-controlled head must never be able to invalidate the
// proxy-appended tail.
describe("trustedForwardedSuffix", () => {
  it("passes a well-formed chain through verbatim", () => {
    expect(trustedForwardedSuffix("203.0.113.5")).toBe("203.0.113.5");
    expect(trustedForwardedSuffix("203.0.113.5, 10.0.0.7")).toBe("203.0.113.5, 10.0.0.7");
  });

  it("keeps the spoofed head so Echo's right-to-left walk still finds the real IP", () => {
    // A viewer sending `X-Forwarded-For: 1.2.3.4` gets their real address
    // appended by Caddy. Trimming the head ourselves is what would hand the
    // limiter the spoofed value.
    expect(trustedForwardedSuffix("1.2.3.4, 203.0.113.5")).toBe("1.2.3.4, 203.0.113.5");
  });

  it("drops an unparseable head instead of letting it void the whole header", () => {
    expect(trustedForwardedSuffix("junk, 203.0.113.5")).toBe("203.0.113.5");
    expect(trustedForwardedSuffix("<script>, 10.0.0.1, 203.0.113.5")).toBe(
      "10.0.0.1, 203.0.113.5",
    );
  });

  it("rejects entries Go's net.ParseIP rejects", () => {
    expect(trustedForwardedSuffix("01.2.3.4")).toBe(""); // leading zero
    expect(trustedForwardedSuffix("203.0.113.999")).toBe(""); // octet > 255
    expect(trustedForwardedSuffix("203.0.113.5:443")).toBe(""); // port
    expect(trustedForwardedSuffix("fe80::1%eth0")).toBe(""); // zone id
  });

  it("accepts IPv6, bracketed or bare, including the v4-mapped form", () => {
    expect(trustedForwardedSuffix("2001:db8::1")).toBe("2001:db8::1");
    expect(trustedForwardedSuffix("[2001:db8::1]")).toBe("[2001:db8::1]");
    expect(trustedForwardedSuffix("::ffff:203.0.113.5")).toBe("::ffff:203.0.113.5");
  });

  it("bounds the relayed chain to the proxy-appended tail", () => {
    const chain = Array.from({ length: 12 }, (_, i) => `10.0.0.${i + 1}`).join(", ");
    const kept = trustedForwardedSuffix(chain).split(", ");
    expect(kept).toHaveLength(8);
    expect(kept.at(-1)).toBe("10.0.0.12");
  });

  it("is empty for a missing or blank header", () => {
    expect(trustedForwardedSuffix(null)).toBe("");
    expect(trustedForwardedSuffix(undefined)).toBe("");
    expect(trustedForwardedSuffix("")).toBe("");
    expect(trustedForwardedSuffix("   ")).toBe("");
  });
});

describe("clientIpForwardHeaders", () => {
  it("forwards nothing outside a request scope rather than throwing", async () => {
    // This is also the local `npm run dev` / route-mocked e2e shape: no proxy
    // in front of Next, so there is no viewer IP to forward and the call must
    // behave exactly as it did before this header existed.
    await expect(clientIpForwardHeaders()).resolves.toEqual({});
  });
});
