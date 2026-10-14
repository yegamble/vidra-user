import { describe, expect, it } from "vitest";
import { bufferAhead, collectPlaybackStats, formatBitrate, statsRows } from "./player-stats";

const ranges = (pairs: Array<[number, number]>) =>
  ({ length: pairs.length, start: (i: number) => pairs[i][0], end: (i: number) => pairs[i][1] }) as TimeRanges;

describe("player stats", () => {
  it("measures buffer only inside the range holding the playhead", () => {
    expect(bufferAhead(ranges([[0, 10], [20, 30]]), 4)).toBe(6);
    expect(bufferAhead(ranges([[0, 10], [20, 30]]), 15)).toBeNull();
    expect(bufferAhead(ranges([]), 0)).toBeNull();
  });

  it("formats bitrates and never shows 0 for unknown", () => {
    expect(formatBitrate(2_400_000)).toBe("2.4 Mbps");
    expect(formatBitrate(640_000)).toBe("640 kbps");
    expect(formatBitrate(null)).toBe("—");
    expect(formatBitrate(0)).toBe("—");
  });

  it("collects resolution, bitrate, codecs, buffer and dropped frames", () => {
    const stats = collectPlaybackStats(
      {
        videoWidth: 1280, videoHeight: 720, currentTime: 2, playbackRate: 1.5,
        buffered: ranges([[0, 12]]),
        getVideoPlaybackQuality: () => ({ droppedVideoFrames: 3, totalVideoFrames: 900 }),
      },
      { currentLevel: 1, bandwidthEstimate: 5_000_000,
        levels: [{ bitrate: 800_000 }, { bitrate: 2_400_000, videoCodec: "avc1.64001f", audioCodec: "mp4a.40.2" }] },
      "hls-js",
    );
    expect(Object.fromEntries(statsRows(stats))).toEqual({
      Engine: "hls-js", Resolution: "1280×720", Bitrate: "2.4 Mbps", Bandwidth: "5.0 Mbps",
      Codecs: "avc1.64001f, mp4a.40.2", Buffer: "10.0 s", "Dropped frames": "3 / 900", Speed: "1.5×",
    });
  });

  it("degrades to dashes with no engine and no metadata", () => {
    const rows = Object.fromEntries(statsRows(collectPlaybackStats(
      { videoWidth: 0, videoHeight: 0, currentTime: 0, playbackRate: 1, buffered: ranges([]) }, null, "progressive")));
    expect(rows.Resolution).toBe("—");
    expect(rows.Codecs).toBe("—");
    expect(rows["Dropped frames"]).toBe("—");
  });
});
