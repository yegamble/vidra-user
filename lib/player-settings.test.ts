// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTO_LEVEL, type LevelOption } from "./hls";
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_EVENT,
  QUALITY_OPTIONS,
  getPlayerSettingsSnapshot,
  hydratePlayerSettings,
  matchQualityLevel,
  resetPlayerSettings,
} from "./player-settings";

afterEach(() => {
  resetPlayerSettings();
  vi.restoreAllMocks();
});

describe("DEFAULT_PLAYER_SETTINGS", () => {
  it("mirrors the baked player behaviour (1×, autoplay on, Auto, captions off, theater off)", () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({
      autoplay_next: true,
      default_speed: 1,
      default_quality: "auto",
      captions_default: false,
      theater_default: false,
    });
  });
});

describe("effective-settings holder", () => {
  it("starts at the baked defaults", () => {
    expect(getPlayerSettingsSnapshot()).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it("hydrate installs the server settings and reset returns to the baked defaults", () => {
    const server = {
      autoplay_next: false,
      default_speed: 1.5,
      default_quality: "1080p",
      captions_default: true,
      theater_default: true,
    };
    hydratePlayerSettings(server);
    expect(getPlayerSettingsSnapshot()).toEqual(server);
    resetPlayerSettings();
    expect(getPlayerSettingsSnapshot()).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it("broadcasts the settings event on hydrate and reset", () => {
    const onChange = vi.fn();
    window.addEventListener(PLAYER_SETTINGS_EVENT, onChange);
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, default_speed: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
    resetPlayerSettings();
    expect(onChange).toHaveBeenCalledTimes(2);
    window.removeEventListener(PLAYER_SETTINGS_EVENT, onChange);
  });
});

describe("QUALITY_OPTIONS", () => {
  it("offers Auto plus the common rungs, Auto first", () => {
    expect(QUALITY_OPTIONS.map((o) => o.value)).toEqual([
      "auto",
      "2160p",
      "1440p",
      "1080p",
      "720p",
      "480p",
      "360p",
    ]);
  });
});

describe("matchQualityLevel", () => {
  const levels: LevelOption[] = [
    { level: AUTO_LEVEL, label: "Auto" },
    { level: 2, label: "1080p" },
    { level: 1, label: "720p" },
    { level: 0, label: "360p" },
  ];

  it("maps a rung this video offers to its hls.js level index", () => {
    expect(matchQualityLevel("720p", levels)).toBe(1);
    expect(matchQualityLevel("1080p", levels)).toBe(2);
    expect(matchQualityLevel("360p", levels)).toBe(0);
  });

  it("maps 'auto' to Auto", () => {
    expect(matchQualityLevel("auto", levels)).toBe(AUTO_LEVEL);
  });

  it("maps an unknown / unavailable rung to Auto (the W1.6 fallback)", () => {
    // this video has no 2160p rung
    expect(matchQualityLevel("2160p", levels)).toBe(AUTO_LEVEL);
    // a nonsense value never crashes — it just stays adaptive
    expect(matchQualityLevel("banana", levels)).toBe(AUTO_LEVEL);
  });

  it("stays on Auto when the level menu is empty (no HLS renditions)", () => {
    expect(matchQualityLevel("720p", [])).toBe(AUTO_LEVEL);
  });
});
