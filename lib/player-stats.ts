// "Stats for nerds" data (PeerTube/YouTube parity). Pure: the caller hands in the
// media element and, when hls.js owns playback, a structural slice of the engine,
// so this module imports no hls.js type and is unit-testable without a browser.

/** The slice of an hls.js instance the overlay reads (all optional-safe). */
export interface StatsEngine {
  levels?: ReadonlyArray<{
    bitrate?: number;
    videoCodec?: string;
    audioCodec?: string;
    codecSet?: string;
  }>;
  currentLevel?: number;
  bandwidthEstimate?: number;
}

export interface PlaybackStats {
  engine: string;
  resolution: string | null;
  /** The playing rung's declared bitrate, bits/s. */
  bitrate: number | null;
  /** hls.js's measured throughput, bits/s. */
  bandwidth: number | null;
  codecs: string | null;
  bufferAheadSeconds: number | null;
  droppedFrames: number | null;
  totalFrames: number | null;
  playbackRate: number;
}

type StatsElement = Pick<HTMLVideoElement, "videoWidth" | "videoHeight" | "currentTime" | "buffered" | "playbackRate"> & {
  getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
};

/** Seconds buffered ahead of the playhead, or null when nothing is buffered there. */
export function bufferAhead(buffered: TimeRanges, currentTime: number): number | null {
  for (let i = 0; i < buffered.length; i++) {
    if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
      return Math.max(0, buffered.end(i) - currentTime);
    }
  }
  return null;
}

export function collectPlaybackStats(
  el: StatsElement,
  engine: StatsEngine | null,
  engineName: string,
): PlaybackStats {
  const level = engine?.levels?.[engine.currentLevel ?? -1];
  const quality = el.getVideoPlaybackQuality?.();
  const codecs = level
    ? [level.videoCodec, level.audioCodec].filter(Boolean).join(", ") || level.codecSet || null
    : null;
  return {
    engine: engineName,
    resolution: el.videoWidth > 0 && el.videoHeight > 0 ? `${el.videoWidth}×${el.videoHeight}` : null,
    bitrate: level?.bitrate && level.bitrate > 0 ? level.bitrate : null,
    bandwidth: engine?.bandwidthEstimate && engine.bandwidthEstimate > 0 ? engine.bandwidthEstimate : null,
    codecs,
    bufferAheadSeconds: bufferAhead(el.buffered, el.currentTime),
    droppedFrames: quality ? quality.droppedVideoFrames : null,
    totalFrames: quality ? quality.totalVideoFrames : null,
    playbackRate: el.playbackRate,
  };
}

/** `2.4 Mbps` / `640 kbps`; an unknown value is an em dash, never "0". */
export function formatBitrate(bps: number | null): string {
  if (bps === null || !Number.isFinite(bps) || bps <= 0) return "—";
  return bps >= 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`;
}

/** Label/value rows for the overlay, in display order. */
export function statsRows(s: PlaybackStats): Array<[label: string, value: string]> {
  return [
    ["Engine", s.engine],
    ["Resolution", s.resolution ?? "—"],
    ["Bitrate", formatBitrate(s.bitrate)],
    ["Bandwidth", formatBitrate(s.bandwidth)],
    ["Codecs", s.codecs ?? "—"],
    ["Buffer", s.bufferAheadSeconds === null ? "—" : `${s.bufferAheadSeconds.toFixed(1)} s`],
    ["Dropped frames", s.droppedFrames === null ? "—" : `${s.droppedFrames} / ${s.totalFrames ?? 0}`],
    ["Speed", `${s.playbackRate}×`],
  ];
}
