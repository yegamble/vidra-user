// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_VOLUME, readStoredVolume, storeVolume } from "./player-volume";

afterEach(() => localStorage.clear());

describe("player volume persistence", () => {
  it("defaults to full volume, unmuted, when nothing is stored", () => {
    expect(readStoredVolume()).toEqual(DEFAULT_VOLUME);
  });

  it("remembers a level across reads — localStorage, so a new tab sees it too", () => {
    storeVolume(0.35, false);
    expect(readStoredVolume()).toEqual({ volume: 0.35, muted: false });
  });

  it("remembers mute independently of the level, so unmuting restores it", () => {
    storeVolume(0.4, true);
    expect(readStoredVolume()).toEqual({ volume: 0.4, muted: true });
  });

  it("clamps a value outside 0..1 rather than handing the element a bad one", () => {
    storeVolume(4, false);
    expect(readStoredVolume().volume).toBe(1);
  });

  it("falls back to the default on a corrupt value", () => {
    localStorage.setItem("vidra.player.volume", "loud");
    expect(readStoredVolume().volume).toBe(1);
  });
});
