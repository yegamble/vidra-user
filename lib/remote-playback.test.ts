import { describe, expect, it } from "vitest";

import { isHlsUrl, remotePlaybackSources } from "./remote-playback";
import { pickEngine, selectEngines } from "./player-engine";

describe("isHlsUrl", () => {
  it("detects .m3u8 playlists, with or without query/fragment", () => {
    expect(isHlsUrl("https://origin.example/v/master.m3u8")).toBe(true);
    expect(isHlsUrl("https://origin.example/v/master.m3u8?token=x")).toBe(true);
    expect(isHlsUrl("https://origin.example/v/MASTER.M3U8#x")).toBe(true);
  });

  it("rejects direct files and lookalikes", () => {
    expect(isHlsUrl("https://origin.example/v/file.mp4")).toBe(false);
    expect(isHlsUrl("https://origin.example/v/m3u8/file.webm")).toBe(false);
  });
});

describe("remotePlaybackSources", () => {
  const HLS = "https://origin.example/v/master.m3u8";
  const MP4 = "https://origin.example/v/file.mp4";

  it("has no sources at all without a stream_url", () => {
    expect(remotePlaybackSources(undefined)).toEqual({});
  });

  it("offers a direct file to the progressive engine only", () => {
    expect(remotePlaybackSources(MP4)).toEqual({ progressive: MP4 });
  });

  it("offers a playlist to both HLS engines, so an Apple browser keeps the ladder", () => {
    expect(remotePlaybackSources(HLS)).toEqual({ hlsJs: HLS, nativeHls: HLS });
  });

  // The four outcomes the old chooseRemotePlaybackMode enumerated are now what
  // the SHARED selection makes of these sources — one decision, not a second
  // copy of it that can drift.
  it("still yields the four federated outcomes through the shared selection", () => {
    const pick = (
      streamUrl: string | undefined,
      support: { mseSupported: boolean; nativeHls: boolean },
    ) => pickEngine(selectEngines(remotePlaybackSources(streamUrl), support), []);

    expect(pick(undefined, { mseSupported: true, nativeHls: true })).toBeNull();
    expect(pick(MP4, { mseSupported: false, nativeHls: false })).toBe("progressive");
    expect(pick(HLS, { mseSupported: true, nativeHls: true })).toBe("hls-js");
    expect(pick(HLS, { mseSupported: false, nativeHls: true })).toBe("native-hls");
    expect(pick(HLS, { mseSupported: false, nativeHls: false })).toBeNull();
  });
});
