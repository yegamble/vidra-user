import { describe, expect, it } from "vitest";

import { chooseRemotePlaybackMode, isHlsUrl } from "./remote-playback";

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

describe("chooseRemotePlaybackMode", () => {
  const HLS = "https://origin.example/v/master.m3u8";
  const MP4 = "https://origin.example/v/file.mp4";

  it("is none without a stream_url", () => {
    expect(
      chooseRemotePlaybackMode({ streamUrl: undefined, mseSupported: true, nativeHls: true }),
    ).toBe("none");
  });

  it("plays a direct file as a plain <video src> regardless of HLS support", () => {
    expect(chooseRemotePlaybackMode({ streamUrl: MP4, mseSupported: false, nativeHls: false })).toBe(
      "direct",
    );
  });

  it("prefers hls.js (MSE) for HLS streams", () => {
    expect(chooseRemotePlaybackMode({ streamUrl: HLS, mseSupported: true, nativeHls: true })).toBe(
      "hls-js",
    );
  });

  it("falls back to native HLS without MSE (iOS Safari)", () => {
    expect(chooseRemotePlaybackMode({ streamUrl: HLS, mseSupported: false, nativeHls: true })).toBe(
      "native-hls",
    );
  });

  it("is none for an HLS stream with no HLS capability at all", () => {
    expect(chooseRemotePlaybackMode({ streamUrl: HLS, mseSupported: false, nativeHls: false })).toBe(
      "none",
    );
  });
});
