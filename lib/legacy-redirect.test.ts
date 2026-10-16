import { describe, expect, it } from "vitest";

import { legacyEmbedSearch, legacyPlaylistEmbedSearch, legacyWatchSearch } from "./legacy-redirect";

describe("legacyWatchSearch", () => {
  it("maps PeerTube's start to vidra's t and keeps other params", () => {
    expect(legacyWatchSearch("?start=1m30s&autoplay=1")).toBe("?autoplay=1&t=1m30s");
  });
  it("lets an explicit t win over start", () => {
    expect(legacyWatchSearch("?start=5&t=90")).toBe("?t=90");
  });
  it("is empty for no query", () => {
    expect(legacyWatchSearch("")).toBe("");
  });
});

describe("legacyEmbedSearch", () => {
  it("maps start to t", () => {
    expect(legacyEmbedSearch("?start=90&playlistPosition=2")).toBe("?t=90");
  });
  it("drops everything unknown when there is no start time", () => {
    expect(legacyEmbedSearch("?playlistPosition=3")).toBe("");
  });
});

describe("empty t", () => {
  it("is treated as absent, so start still maps", () => {
    expect(legacyWatchSearch("?start=1m30s&t=")).toBe("?t=1m30s");
    expect(legacyEmbedSearch("?start=90&t=")).toBe("?t=90");
  });
});

describe("legacyEmbedSearch carries PeerTube embed options", () => {
  it("keeps the supported options and maps start", () => {
    const out = new URLSearchParams(
      legacyEmbedSearch("?start=90&stop=120&autoplay=1&muted=1&loop=1&title=0&controls=0&warningTitle=0&peertubeLink=0&api=1&scope=x"),
    );
    expect(Object.fromEntries(out)).toEqual({
      t: "90", stop: "120", autoplay: "1", muted: "1", loop: "1", title: "0",
      controls: "0", warningTitle: "0", peertubeLink: "0", api: "1", scope: "x",
    });
  });
  it("still drops unknown params and unsafe values", () => {
    expect(legacyEmbedSearch("?playlistPosition=3&autoplay=<script>")).toBe("");
  });
});

describe("legacyPlaylistEmbedSearch", () => {
  it("also carries playlistPosition, validated like the rest", () => {
    expect(legacyPlaylistEmbedSearch("?start=90&playlistPosition=3&x=1")).toBe("?t=90&playlistPosition=3");
    expect(legacyPlaylistEmbedSearch("?playlistPosition=<b>")).toBe("");
  });
});
