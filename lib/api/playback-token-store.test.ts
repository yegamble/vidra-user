import { afterEach, describe, expect, it } from "vitest";

import {
  clearPlaybackToken,
  getPlaybackToken,
  setPlaybackToken,
} from "./playback-token-store";

afterEach(() => {
  clearPlaybackToken("v1");
  clearPlaybackToken("v2");
});

describe("playback-token-store", () => {
  it("returns null for a video with no minted token", () => {
    expect(getPlaybackToken("v1")).toBeNull();
  });

  it("stores and reads a video's token", () => {
    setPlaybackToken("v1", "tok-1");
    expect(getPlaybackToken("v1")).toBe("tok-1");
  });

  it("keeps tokens for different videos separate", () => {
    setPlaybackToken("v1", "tok-1");
    setPlaybackToken("v2", "tok-2");
    expect(getPlaybackToken("v1")).toBe("tok-1");
    expect(getPlaybackToken("v2")).toBe("tok-2");
  });

  it("replaces a video's token on re-set", () => {
    setPlaybackToken("v1", "tok-1");
    setPlaybackToken("v1", "tok-1b");
    expect(getPlaybackToken("v1")).toBe("tok-1b");
  });

  it("drops a video's token on clear (navigate away)", () => {
    setPlaybackToken("v1", "tok-1");
    clearPlaybackToken("v1");
    expect(getPlaybackToken("v1")).toBeNull();
  });
});
