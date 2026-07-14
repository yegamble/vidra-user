"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { liveHlsMasterUrl } from "@/lib/api";
import {
  AUTO_LEVEL,
  buildLevelMenu,
  canPlayNativeHls,
  choosePlaybackMode,
  type LevelOption,
  type PlaybackMode,
} from "@/lib/hls";

// How many hls.js-recommended recoveries (network → startLoad, media →
// recoverMediaError) to attempt after the manifest parsed before giving up.
// A live stream has no progressive-original fallback, so exhaustion surfaces a
// failed state rather than swapping the source.
const MAX_RECOVERIES = 2;

export interface LivePlayback {
  mode: PlaybackMode;
  /** src for the media element; undefined while hls.js owns it via MSE. */
  src: string | undefined;
  /** Quality menu entries (Auto + one per height); [] when nothing is selectable. */
  levels: LevelOption[];
  currentLevel: number;
  setLevel: (level: number) => void;
  /**
   * True once the live playlist could not be played (hls.js fatal after bounded
   * recovery, or no HLS support at all). A live stream has no original file to
   * fall back to, so the surface shows an honest error instead.
   */
  failed: boolean;
}

// probeSupport sniffs the browser's HLS capabilities. A scratch element answers
// canPlayType (it is per-type, not per-instance). Mirrors use-hls-playback.
function probeSupport(): { mseSupported: boolean; nativeHls: boolean } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { mseSupported: false, nativeHls: false };
  }
  return {
    mseSupported: "MediaSource" in window || "ManagedMediaSource" in window,
    nativeHls: canPlayNativeHls(document.createElement("video")),
  };
}

/**
 * useLivePlayback wires a media element to a live stream's HLS playlist using the
 * same shared decision helpers as VOD (lib/hls.ts): hls.js over MSE (quality
 * selectable), native HLS on MSE-less Safari, else unsupported. Unlike VOD there
 * is no progressive fallback — a fatal error sets `failed` so the watch surface
 * can say the live feed is unavailable rather than spin a dead player. The
 * stream id is the key: re-mounting for a different stream decides afresh.
 */
export function useLivePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  streamId: string,
): LivePlayback {
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [currentLevel, setCurrentLevel] = useState(AUTO_LEVEL);
  // hls.js pipeline failed fatally (set only from async callbacks). The
  // no-HLS-support case is derived synchronously below, not via state.
  const [hlsFailed, setHlsFailed] = useState(false);
  const hlsRef = useRef<Hls | null>(null);

  // A live stream always advertises HLS at the watch surface (hls_url present),
  // so hasHls is true here; the browser's capabilities decide the mode. "original"
  // means no HLS capability at all — and a live stream has no progressive file to
  // fall back to, so that is a failure for the watch surface.
  const support = probeSupport();
  const mode: PlaybackMode = choosePlaybackMode({ hasHls: true, ...support });
  const failed = mode === "original" || hlsFailed;

  useEffect(() => {
    if (mode !== "hls-js") return; // native-hls plays via the <video src> below.
    const el = videoRef.current;
    if (!el) return;
    let disposed = false;
    // Dynamic import: the hls.js chunk loads only when a live stream actually
    // plays through MSE.
    void import("hls.js")
      .then(({ default: HlsClass }) => {
        if (disposed) return;
        if (!HlsClass.isSupported()) {
          setHlsFailed(true);
          return;
        }
        const hls = new HlsClass({
          // nginx-rtmp emits conventional HLS playlists (EXTINF segments), not
          // LL-HLS parts/server-control tags. Keep hls.js on its matching plain
          // HLS path until the media server actually publishes those LL tags.
          lowLatencyMode: false,
          // Live playback needs a much shorter rewind window than VOD. Bounding
          // it prevents an open live tab from retaining the entire broadcast.
          backBufferLength: 30,
          capLevelToPlayerSize: true,
          capLevelOnFPSDrop: true,
        });
        hlsRef.current = hls;
        let parsed = false;
        let recoveries = 0;
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          parsed = true;
          setLevels(buildLevelMenu(hls.levels));
        });
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (!parsed || recoveries >= MAX_RECOVERIES) {
            hls.destroy();
            hlsRef.current = null;
            setHlsFailed(true);
            return;
          }
          recoveries += 1;
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
            hlsRef.current = null;
            setHlsFailed(true);
          }
        });
        hls.loadSource(liveHlsMasterUrl(streamId));
        hls.attachMedia(el);
      })
      .catch(() => {
        if (!disposed) setHlsFailed(true);
      });
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [mode, streamId, videoRef]);

  const src = mode === "native-hls" ? liveHlsMasterUrl(streamId) : undefined;

  return {
    mode,
    src,
    levels: mode === "hls-js" ? levels : [],
    currentLevel,
    setLevel: (level: number) => {
      const hls = hlsRef.current;
      if (!hls) return;
      // Switch at the next fragment boundary instead of flushing the live
      // buffer and re-seeking immediately.
      hls.nextLevel = level;
      setCurrentLevel(level);
    },
    failed,
  };
}
