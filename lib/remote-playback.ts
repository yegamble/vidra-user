// Pure playback decision for REMOTE (federated) videos. Local videos decide via
// lib/hls.ts (they always have the progressive /original fallback); a remote
// video only has whatever stream_url the origin advertised, so the modes and
// fallbacks differ: no stream (or no way to play it) means "link out to the
// origin's watch page" rather than a dead player. No React, no hls.js here —
// the runtime wiring lives in lib/use-remote-playback.ts.

/**
 * How a remote video should be played:
 * - "hls-js"     — stream_url is an HLS playlist, via hls.js over MSE.
 * - "native-hls" — HLS straight into <video src> (Safari/iOS without MSE).
 * - "direct"     — a direct file (mp4 etc.) into <video src>.
 * - "none"       — nothing playable here; the page links out via watch_url.
 */
export type RemotePlaybackMode = "hls-js" | "native-hls" | "direct" | "none";

/** isHlsUrl sniffs an HLS playlist by its .m3u8 path (query/fragment tolerated). */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:[?#]|$)/i.test(url);
}

/**
 * chooseRemotePlaybackMode picks how to play a remote stream_url. HLS prefers
 * hls.js (MSE) with native HLS as the MSE-less fallback — mirroring local
 * playback — and an HLS stream with no HLS capability at all yields "none"
 * (the origin watch page is the honest way to view it). Non-HLS URLs play as
 * a plain <video src>.
 */
export function chooseRemotePlaybackMode(input: {
  streamUrl: string | undefined;
  mseSupported: boolean;
  nativeHls: boolean;
}): RemotePlaybackMode {
  if (!input.streamUrl) return "none";
  if (!isHlsUrl(input.streamUrl)) return "direct";
  if (input.mseSupported) return "hls-js";
  if (input.nativeHls) return "native-hls";
  return "none";
}
