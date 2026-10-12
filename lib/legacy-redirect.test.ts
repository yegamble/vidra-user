import { describe, expect, it } from "vitest";

import { legacyEmbedSearch, legacyWatchSearch } from "./legacy-redirect";

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
  it("keeps only t, mapping start", () => {
    expect(legacyEmbedSearch("?start=90&stop=120&autoplay=1&muted=1&loop=1&title=0")).toBe("?t=90");
  });
  it("drops everything when there is no start time", () => {
    expect(legacyEmbedSearch("?autoplay=1&playlistPosition=3")).toBe("");
  });
});
