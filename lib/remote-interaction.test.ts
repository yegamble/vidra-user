import { describe, expect, it } from "vitest";

import {
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
