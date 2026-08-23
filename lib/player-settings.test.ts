// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildLevelMenu } from "./hls";
import { AUTO_QUALITY } from "./quality-id";
import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_EVENT,
  QUALITY_OPTIONS,
  arePlayerSettingsHydrated,
  arePlayerSettingsSettled,
  getPlayerSettingsSnapshot,
  hydratePlayerSettings,
  matchQualityLevel,
  resetPlayerSettings,
  unsettlePlayerSettingsForTests,
} from "./player-settings";

afterEach(() => {
  unsettlePlayerSettingsForTests(); // pristine boot state, incl. settled=false
  vi.restoreAllMocks();
});

describe("DEFAULT_PLAYER_SETTINGS", () => {
  it("mirrors the baked player behaviour, including previews off by default", () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({
      autoplay_next: true,
      default_speed: 1,
      default_quality: "auto",
      captions_default: false,
      theater_default: false,
      video_card_previews_enabled: false,
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
      video_card_previews_enabled: true,
    };
    hydratePlayerSettings(server);
    expect(getPlayerSettingsSnapshot()).toEqual(server);
    resetPlayerSettings();
    expect(getPlayerSettingsSnapshot()).toEqual(DEFAULT_PLAYER_SETTINGS);
  });

  it("tracks hydration and settlement separately (W5 start-on-open hold)", () => {
    // Boot: nothing hydrated, per-user layer UNRESOLVED.
    expect(arePlayerSettingsHydrated()).toBe(false);
    expect(arePlayerSettingsSettled()).toBe(false);
    // A signed-in user's settings landing settles the question…
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: false });
    expect(arePlayerSettingsHydrated()).toBe(true);
    expect(arePlayerSettingsSettled()).toBe(true);
    // …and so does resolving as anonymous / signing out: no per-user layer,
    // but the question is ANSWERED (settled without hydration).
    resetPlayerSettings();
    expect(arePlayerSettingsHydrated()).toBe(false);
    expect(arePlayerSettingsSettled()).toBe(true);
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
  const HEVC = "hvc1,mp4a";
  // The menu as the engine adapter builds it: one entry per height, inside the
  // codec family being played, each carrying its representation.
  const levels = buildLevelMenu([
    { height: 360, codecSet: HEVC, uri: "media_0.m3u8" },
    { height: 720, codecSet: HEVC, uri: "media_1.m3u8" },
    { height: 1080, codecSet: HEVC, uri: "media_2.m3u8" },
  ]);

  it("maps a rung this video offers to that rung's engine-neutral id", () => {
    expect(matchQualityLevel("720p", levels)).toEqual({
      height: 720,
      codecFamily: HEVC,
      repId: 1,
    });
    expect(matchQualityLevel("1080p", levels)).toEqual({
      height: 1080,
      codecFamily: HEVC,
      repId: 2,
    });
    expect(matchQualityLevel("360p", levels)).toEqual({
      height: 360,
      codecFamily: HEVC,
      repId: 0,
    });
  });

  it("matches on the stored HEIGHT, inside whatever family the menu was built from", () => {
    // The preference keeps its wire format — a height and nothing finer — so the
    // SAME "720p" resolves to the H.264 rung when H.264 is what is playing.
    const avc = buildLevelMenu([
      { height: 720, codecSet: "avc1,mp4a", uri: "media_7.m3u8" },
      { height: 1080, codecSet: "avc1,mp4a", uri: "media_8.m3u8" },
    ]);
    expect(matchQualityLevel("720p", avc)).toEqual({
      height: 720,
      codecFamily: "avc1,mp4a",
      repId: 7,
    });
  });

  it("maps 'auto' to Auto", () => {
    expect(matchQualityLevel("auto", levels)).toBe(AUTO_QUALITY);
  });

  it("maps an unknown / unavailable rung to Auto (the W1.6 fallback)", () => {
    // this video has no 2160p rung
    expect(matchQualityLevel("2160p", levels)).toBe(AUTO_QUALITY);
    // a nonsense value never crashes — it just stays adaptive
    expect(matchQualityLevel("banana", levels)).toBe(AUTO_QUALITY);
  });

  it("stays on Auto when the level menu is empty (no HLS renditions)", () => {
    expect(matchQualityLevel("720p", [])).toBe(AUTO_QUALITY);
  });
});
