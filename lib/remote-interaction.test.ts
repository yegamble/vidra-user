import { describe, expect, it, vi } from "vitest";

import {
  browserSubscribeUrl,
  interactionTarget,
  parseFediverseHandle,
  parseInteractionUri,
  safeSubscribeUrl,
} from "@/lib/remote-interaction";

describe("parseFediverseHandle", () => {
  it("accepts user@host with or without a leading @", () => {
    expect(parseFediverseHandle("bob@mastodon.social")).toBe("bob@mastodon.social");
    expect(parseFediverseHandle(" @bob@mastodon.social ")).toBe("bob@mastodon.social");
  });
  it("rejects URLs, bare names and junk", () => {
    for (const bad of ["", "bob", "https://mastodon.social/@bob", "a@b@c.d", "bob@localhost", "bob @x.io"]) {
      expect(parseFediverseHandle(bad)).toBeNull();
    }
  });
});

describe("interactionTarget", () => {
  it("builds the ActivityPub ids core serves", () => {
    expect(interactionTarget("https://v.example", "channel", "films")).toBe(
      "https://v.example/video-channels/films",
    );
    expect(interactionTarget("https://v.example", "video", "abc-123")).toBe(
      "https://v.example/videos/abc-123",
    );
  });
});

describe("safeSubscribeUrl", () => {
  it("allows only plain https URLs", () => {
    expect(safeSubscribeUrl("https://home.example/i?uri=x")).toBe("https://home.example/i?uri=x");
    for (const bad of [
      "http://home.example/i",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:pw@home.example/",
      "//home.example/i",
      "",
      null,
      42,
    ]) {
      expect(safeSubscribeUrl(bad)).toBeNull();
    }
  });
});

describe("parseInteractionUri", () => {
  it("accepts http(s) URLs only", () => {
    expect(parseInteractionUri("https://peer.example/video-channels/x")).toBe(
      "https://peer.example/video-channels/x",
    );
    expect(parseInteractionUri("acct:x@y")).toBeNull();
    expect(parseInteractionUri(null)).toBeNull();
    expect(parseInteractionUri("javascript:1")).toBeNull();
  });
});

describe("browserSubscribeUrl", () => {
  const TARGET = "https://v.example/video-channels/films";
  const jrd = (template: string) =>
    ({ ok: true, json: async () => ({ links: [{ rel: "http://ostatus.org/schema/1.0/subscribe", template }] }) }) as Response;

  it("asks the visitor's own server and fills the template", async () => {
    const f = vi.fn().mockResolvedValue(jrd("https://home.example/i?uri={uri}"));
    const url = await browserSubscribeUrl("bob@home.example", TARGET, f as unknown as typeof fetch);
    expect(url).toBe(`https://home.example/i?uri=${encodeURIComponent(TARGET)}`);
    expect(f.mock.calls[0][0]).toBe(
      "https://home.example/.well-known/webfinger?resource=acct%3Abob%40home.example",
    );
    expect(f.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("applies the https-only check to the template", async () => {
    for (const t of ["http://home.example/i?uri={uri}", "javascript:alert({uri})", "https://u:p@home.example/?u={uri}"]) {
      const f = vi.fn().mockResolvedValue(jrd(t));
      expect(await browserSubscribeUrl("bob@home.example", TARGET, f as unknown as typeof fetch)).toBeNull();
    }
  });

  it("returns null on a CORS/network failure, a bad status, or a hostile host", async () => {
    const boom = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await browserSubscribeUrl("bob@home.example", TARGET, boom as unknown as typeof fetch)).toBeNull();
    const notOk = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await browserSubscribeUrl("bob@home.example", TARGET, notOk as unknown as typeof fetch)).toBeNull();
    const never = vi.fn();
    expect(await browserSubscribeUrl("bob@evil.example/x", TARGET, never as unknown as typeof fetch)).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});
