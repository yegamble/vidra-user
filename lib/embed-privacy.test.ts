import { describe, expect, it } from "vitest";

import {
  decideEmbed,
  embedContextHosts,
  hostOf,
  normalizeDomain,
  type EmbedContext,
} from "./embed-privacy";

const TOP: EmbedContext = { isTopLevel: true, ancestorOrigins: [], referrer: "" };
function framedBy(origins: string[], referrer = ""): EmbedContext {
  return { isTopLevel: false, ancestorOrigins: origins, referrer };
}

describe("hostOf", () => {
  it("extracts the bare lowercased hostname, dropping scheme/port/path", () => {
    expect(hostOf("https://Blog.Example.com:8443/embed/v1")).toBe("blog.example.com");
    expect(hostOf("http://example.com")).toBe("example.com");
  });
  it("returns null for a non-URL or empty value", () => {
    expect(hostOf("")).toBeNull();
    expect(hostOf("example.com")).toBeNull(); // not an absolute URL
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("embedContextHosts", () => {
  it("collects ancestor-origin + referrer hosts, deduped and lowercased", () => {
    const hosts = embedContextHosts(
      framedBy(["https://Example.com", "https://top.example.org"], "https://example.com/page"),
    );
    expect(hosts).toContain("example.com");
    expect(hosts).toContain("top.example.org");
    // example.com appears in both the origin and the referrer but only once.
    expect(hosts.filter((h) => h === "example.com")).toHaveLength(1);
  });
});

describe("decideEmbed", () => {
  it("enabled always allows", () => {
    expect(decideEmbed({ status: "enabled" }, TOP)).toBe("allow");
    expect(decideEmbed({ status: "enabled" }, framedBy(["https://any.example"]))).toBe("allow");
  });

  it("disabled always blocks with the disabled verdict", () => {
    expect(decideEmbed({ status: "disabled" }, TOP)).toBe("disabled");
    expect(decideEmbed({ status: "disabled" }, framedBy(["https://any.example"]))).toBe("disabled");
  });

  it("whitelist allows a direct top-level open", () => {
    expect(decideEmbed({ status: "whitelist", allowed_domains: ["example.com"] }, TOP)).toBe(
      "allow",
    );
  });

  it("whitelist allows a framing host on the allow-list (via ancestor origin)", () => {
    expect(
      decideEmbed(
        { status: "whitelist", allowed_domains: ["example.com"] },
        framedBy(["https://example.com"]),
      ),
    ).toBe("allow");
  });

  it("whitelist allows via the referrer fallback (no ancestorOrigins)", () => {
    expect(
      decideEmbed(
        { status: "whitelist", allowed_domains: ["blog.example.com"] },
        framedBy([], "https://blog.example.com/post"),
      ),
    ).toBe("allow");
  });

  it("whitelist blocks a non-listed framing host", () => {
    expect(
      decideEmbed(
        { status: "whitelist", allowed_domains: ["example.com"] },
        framedBy(["https://evil.test"], "https://evil.test/steal"),
      ),
    ).toBe("blocked");
  });

  it("whitelist blocks when framed with no host info at all", () => {
    expect(
      decideEmbed({ status: "whitelist", allowed_domains: ["example.com"] }, framedBy([])),
    ).toBe("blocked");
  });

  it("whitelist match is case-insensitive on both sides", () => {
    expect(
      decideEmbed(
        { status: "whitelist", allowed_domains: ["Example.COM"] },
        framedBy(["https://EXAMPLE.com"]),
      ),
    ).toBe("allow");
  });
});

describe("normalizeDomain", () => {
  it("accepts and lowercases a bare hostname", () => {
    expect(normalizeDomain("  Example.COM ")).toBe("example.com");
    expect(normalizeDomain("blog.example.co.uk")).toBe("blog.example.co.uk");
    expect(normalizeDomain("localhost")).toBe("localhost");
  });
  it("rejects a scheme, port, path, wildcard, or whitespace", () => {
    expect(normalizeDomain("https://example.com")).toBeNull();
    expect(normalizeDomain("example.com:8080")).toBeNull();
    expect(normalizeDomain("example.com/embed")).toBeNull();
    expect(normalizeDomain("*.example.com")).toBeNull();
    expect(normalizeDomain("exa mple.com")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("-bad.example.com")).toBeNull();
  });
});
