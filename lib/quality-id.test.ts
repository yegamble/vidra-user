import { describe, expect, it } from "vitest";

import {
  AUTO_QUALITY,
  heightOfQualityPreference,
  isAutoQuality,
  parseQualityKey,
  qualityKey,
  repIdFromUri,
  sameQuality,
  type QualitySelection,
} from "./quality-id";

describe("the canonical string form", () => {
  const CASES: Array<[QualitySelection, string]> = [
    [AUTO_QUALITY, "auto"],
    [{ height: 720 }, "720p"],
    [{ height: 1080, codecFamily: "hvc1,mp4a" }, "1080p|hvc1,mp4a"],
    [{ height: 1080, codecFamily: "av01,mp4a", repId: 4 }, "1080p|av01,mp4a|r4"],
    [{ height: 360, repId: 0 }, "360p|r0"],
  ];

  it("renders the fixed shape", () => {
    for (const [id, key] of CASES) expect(qualityKey(id)).toBe(key);
  });

  it("round-trips every selection through the string form", () => {
    for (const [id] of CASES) {
      const key = qualityKey(id);
      expect(parseQualityKey(key)).toEqual(id);
      // …and re-rendering the parsed value reproduces the same key exactly, so
      // the form is a serialization and not merely a display string.
      expect(qualityKey(parseQualityKey(key)!)).toBe(key);
    }
  });

  it("rejects anything that is not a canonical key", () => {
    for (const bad of ["", "720", "p720", "0p", "720p|", "720p|r1|r2", "720p|r1|avc1,mp4a"]) {
      expect(parseQualityKey(bad)).toBeNull();
    }
  });

  it("distinguishes the same height in different codec families", () => {
    const avc = { height: 720, codecFamily: "avc1,mp4a" };
    const hevc = { height: 720, codecFamily: "hvc1,mp4a" };
    expect(qualityKey(avc)).not.toBe(qualityKey(hevc));
    expect(sameQuality(avc, hevc)).toBe(false);
    expect(sameQuality(avc, { ...avc })).toBe(true);
  });

  it("never equates a null (nothing playing / nothing pending) with a selection", () => {
    expect(sameQuality(null, { height: 720 })).toBe(false);
    expect(sameQuality({ height: 720 }, null)).toBe(false);
    expect(sameQuality(null, null)).toBe(false);
  });
});

describe("the auto sentinel", () => {
  it("is the string 'auto', not a magic index", () => {
    expect(AUTO_QUALITY).toBe("auto");
    expect(isAutoQuality(AUTO_QUALITY)).toBe(true);
    expect(isAutoQuality({ height: 720 })).toBe(false);
  });

  it("keys and round-trips like any other selection", () => {
    expect(qualityKey(AUTO_QUALITY)).toBe("auto");
    expect(parseQualityKey("auto")).toBe(AUTO_QUALITY);
    expect(sameQuality(AUTO_QUALITY, AUTO_QUALITY)).toBe(true);
    expect(sameQuality(AUTO_QUALITY, { height: 720 })).toBe(false);
  });
});

describe("heightOfQualityPreference", () => {
  it("reads the height out of the durable wire format", () => {
    expect(heightOfQualityPreference("720p")).toBe(720);
    expect(heightOfQualityPreference("2160p")).toBe(2160);
    expect(heightOfQualityPreference("60p")).toBe(60);
  });

  it("is null for 'auto' and for anything that is not a rung", () => {
    expect(heightOfQualityPreference("auto")).toBeNull();
    expect(heightOfQualityPreference("")).toBeNull();
    expect(heightOfQualityPreference("banana")).toBeNull();
    // The server validates ^[0-9]{2,4}p$ — a value outside it never stays.
    expect(heightOfQualityPreference("7p")).toBeNull();
    expect(heightOfQualityPreference("21600p")).toBeNull();
    expect(heightOfQualityPreference("720")).toBeNull();
  });
});

describe("repIdFromUri", () => {
  it("reads the representation number out of a CMAF variant playlist name", () => {
    expect(repIdFromUri("media_0.m3u8")).toBe(0);
    expect(repIdFromUri("https://cdn.test/v/abc/hls/media_12.m3u8")).toBe(12);
    // An engine reports the RESOLVED url, cache-buster and fragment included.
    expect(repIdFromUri("https://cdn.test/v/abc/hls/media_3.m3u8?v=gen-2#x")).toBe(3);
  });

  it("is undefined for trees that name no representation — nothing may require it", () => {
    // The MPEG-TS back catalog…
    expect(repIdFromUri("https://cdn.test/v/abc/hls/720p/playlist.m3u8")).toBeUndefined();
    // …a PeerTube pass-through tree…
    expect(repIdFromUri("https://peer.test/static/streaming-playlists/hls/x-720.m3u8")).toBeUndefined();
    // …and the degenerate inputs.
    expect(repIdFromUri("media_.m3u8")).toBeUndefined();
    expect(repIdFromUri("media_2.ts")).toBeUndefined();
    expect(repIdFromUri("")).toBeUndefined();
    expect(repIdFromUri(undefined)).toBeUndefined();
  });
});
