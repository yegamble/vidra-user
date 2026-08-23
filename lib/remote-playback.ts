// The source shape of a REMOTE (federated) video. Local videos always have the
// progressive /original to fall back to; a remote video only has whatever
// stream_url the origin advertised, and that URL may be a playlist or a file.
// Deciding which is the one genuinely remote-specific step in playback — from
// there the shared engine selection (lib/player-engine.ts) and the shared
// lifecycle (lib/use-playback-engine.ts) take over unchanged.
//
// No React, no hls.js here.

import type { EngineSources } from "@/lib/player-engine";

/** isHlsUrl sniffs an HLS playlist by its .m3u8 path (query/fragment tolerated). */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:[?#]|$)/i.test(url);
}

/**
 * remotePlaybackSources turns an origin's advertised stream_url into the sources
 * each engine could play:
 *
 * - a playlist is offered to hls.js AND to native HLS, so an MSE-less Apple
 *   browser still gets the origin's ladder rather than nothing;
 * - a direct file (mp4 etc.) is a progressive source and nothing else;
 * - no stream_url means no sources at all, which selects no engine — the page
 *   links out to the origin's watch page rather than showing a dead player.
 */
export function remotePlaybackSources(streamUrl: string | undefined): EngineSources {
  if (!streamUrl) return {};
  if (!isHlsUrl(streamUrl)) return { progressive: streamUrl };
  return { hlsJs: streamUrl, nativeHls: streamUrl };
}
