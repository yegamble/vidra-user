// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  isPlaybackRate,
  normalizePlaybackRate,
  rateLabel,
  readStoredRate,
  stepPlaybackRate,
  storeRate,
} from "./player-rates";
import { hydratePlayerSettings, resetPlayerSettings } from "./player-settings";
import { DEFAULT_PLAYER_SETTINGS } from "./player-settings";

describe("PLAYBACK_RATES ladder", () => {
  it("is the full 0.25×–4× mined ladder in ascending order", () => {
    expect([...PLAYBACK_RATES]).toEqual([
      0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4,
    ]);
  });

  it("includes the default rate", () => {
    expect(isPlaybackRate(DEFAULT_PLAYBACK_RATE)).toBe(true);
    expect(isPlaybackRate(3.5)).toBe(true);
    expect(isPlaybackRate(1.1)).toBe(false);
    expect(isPlaybackRate(5)).toBe(false);
  });
});

describe("rateLabel", () => {
  it("suffixes the rate with × (normal speed reads 1×, not 'Normal')", () => {
    expect(rateLabel(1)).toBe("1×");
    expect(rateLabel(0.25)).toBe("0.25×");
    expect(rateLabel(1.5)).toBe("1.5×");
    expect(rateLabel(4)).toBe("4×");
  });
});

describe("stepPlaybackRate", () => {
  it("steps up to the next rung", () => {
    expect(stepPlaybackRate(1, 1)).toBe(1.25);
    expect(stepPlaybackRate(2, 1)).toBe(2.5);
    expect(stepPlaybackRate(0.25, 1)).toBe(0.5);
  });

  it("steps down to the previous rung", () => {
    expect(stepPlaybackRate(1, -1)).toBe(0.75);
    expect(stepPlaybackRate(2.5, -1)).toBe(2);
    expect(stepPlaybackRate(0.5, -1)).toBe(0.25);
  });

  it("clamps at the ends of the ladder", () => {
    expect(stepPlaybackRate(4, 1)).toBe(4);
    expect(stepPlaybackRate(0.25, -1)).toBe(0.25);
  });

  it("snaps an off-ladder value to the neighbouring rung", () => {
    expect(stepPlaybackRate(1.3, 1)).toBe(1.5);
    expect(stepPlaybackRate(1.3, -1)).toBe(1.25);
  });
});

describe("normalizePlaybackRate", () => {
  it("keeps a valid rung and coerces anything else to normal speed", () => {
    expect(normalizePlaybackRate(1.5)).toBe(1.5);
    expect(normalizePlaybackRate(0.25)).toBe(0.25);
    // off-ladder / non-finite / bad server value → 1 (the W1.6 guard)
    expect(normalizePlaybackRate(1.1)).toBe(DEFAULT_PLAYBACK_RATE);
    expect(normalizePlaybackRate(99)).toBe(DEFAULT_PLAYBACK_RATE);
    expect(normalizePlaybackRate(Number.NaN)).toBe(DEFAULT_PLAYBACK_RATE);
  });
});

describe("session persistence", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    resetPlayerSettings();
  });

  it("returns the default when nothing is stored", () => {
    expect(readStoredRate()).toBe(DEFAULT_PLAYBACK_RATE);
  });

  it("round-trips a stored rate for the session", () => {
    storeRate(2);
    expect(readStoredRate()).toBe(2);
    storeRate(0.5);
    expect(readStoredRate()).toBe(0.5);
  });

  it("falls back to the default for a corrupt or off-ladder stored value", () => {
    window.sessionStorage.setItem("vidra.player.speed", "banana");
    expect(readStoredRate()).toBe(DEFAULT_PLAYBACK_RATE);
    window.sessionStorage.setItem("vidra.player.speed", "1.1");
    expect(readStoredRate()).toBe(DEFAULT_PLAYBACK_RATE);
  });

  it("falls back to the hydrated per-user default_speed when no session value is stored", () => {
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, default_speed: 1.5 });
    // no session value → the per-user default wins
    expect(readStoredRate()).toBe(1.5);
    // an in-session pick still overrides the per-user default
    storeRate(2);
    expect(readStoredRate()).toBe(2);
  });

  it("normalizes an invalid hydrated default_speed back to 1", () => {
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, default_speed: 1.1 });
    expect(readStoredRate()).toBe(DEFAULT_PLAYBACK_RATE);
  });
});
