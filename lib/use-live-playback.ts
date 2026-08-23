"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { liveHlsMasterUrl } from "@/lib/api";
import {
  HLS_AUTO_LEVEL,
  buildLevelMenu,
  canPlayNativeHls,
  choosePlaybackMode,
  resolveLevelIndex,
  type LevelOption,
  type PlaybackMode,
} from "@/lib/hls";
import {
  AUTO_QUALITY,
  isAutoQuality,
  type QualitySelection,
} from "@/lib/quality-id";

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
  /** The user's selection (AUTO_QUALITY = adaptive). Drives the menu's checked entry. */
  currentQuality: QualitySelection;
  setQuality: (quality: QualitySelection) => void;
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
  const [currentQuality, setCurrentQuality] = useState<QualitySelection>(AUTO_QUALITY);
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
        // The codec family the quality menu is built from. A multi-codec master
        // carries the same ladder several times over and ABR never leaves the
        // family it is playing, so the menu must not either — see buildLevelMenu.
        // The live plane needs this for exactly the reason VOD does: without it
        // the menu offers rungs from every family and a manual pick can force a
        // cross-codec (changeType) switch that ABR itself would never make.
        let menuCodecSet: string | undefined;
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          parsed = true;
          menuCodecSet = hls.levels[hls.firstAutoLevel]?.codecSet;
          setLevels(buildLevelMenu(hls.levels, menuCodecSet));
        });
        hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          if (level && level.codecSet !== menuCodecSet) {
            menuCodecSet = level.codecSet;
            setLevels(buildLevelMenu(hls.levels, menuCodecSet));
          }
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
    // Native HLS (iOS Safari, no MSE) deliberately exposes NO quality entries:
    // the browser owns variant selection there, steered by the SCORE attribute
    // on each variant, and nothing can read or set the active one. See the same
    // seam in use-hls-playback.
    levels: mode === "hls-js" ? levels : [],
    currentQuality,
    setQuality: (quality: QualitySelection) => {
      const hls = hlsRef.current;
      if (!hls) return;
      const index = isAutoQuality(quality)
        ? HLS_AUTO_LEVEL
        : resolveLevelIndex(hls.levels, quality);
      if (index === null) return;
      // Switch at the next fragment boundary instead of flushing the live
      // buffer and re-seeking immediately.
      hls.nextLevel = index;
      setCurrentQuality(quality);
    },
    failed,
  };
}
