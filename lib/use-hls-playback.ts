"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { videoHlsMasterUrl, videoOriginalUrl } from "@/lib/api";
import {
  AUTO_LEVEL,
  buildLevelMenu,
  canPlayNativeHls,
  choosePlaybackMode,
  type LevelOption,
  type PlaybackMode,
} from "@/lib/hls";

// How many hls.js-recommended recoveries (network → startLoad, media →
// recoverMediaError) to attempt after the manifest parsed before giving up and
// dropping to the progressive original file.
const MAX_RECOVERIES = 2;

export interface HlsPlayback {
  mode: PlaybackMode;
  /** src for the media element; undefined while hls.js owns it via MSE. */
  src: string | undefined;
  /** Quality menu entries (Auto + one per height); [] when nothing is selectable. */
  levels: LevelOption[];
  /** The user's selected level (-1 = Auto). Drives the menu's checked entry. */
  currentLevel: number;
  /** Pixel height of the rung actually playing (from LEVEL_SWITCHED); null until known. */
  activeHeight: number | null;
  /** True while a manual rung switch has been requested but not yet confirmed. */
  pending: boolean;
  setLevel: (level: number) => void;
}

// probeSupport sniffs the browser's HLS capabilities once per call site. A
// scratch element answers canPlayType (it is per-type, not per-instance).
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
 * useHlsPlayback wires a media element to the right stream for a video:
 * hls.js (dynamically imported, so non-HLS videos never load it) when the
 * detail carries hls_url and MSE exists, native HLS without MSE (iOS Safari),
 * else the progressive /original file. In hls.js mode it exposes the parsed
 * quality levels and a setter driving hls.nextLevel (Auto = -1); a fatal
 * hls.js failure falls back to the original file after bounded recovery
 * attempts, so playback degrades instead of dying.
 *
 * Quality switching uses `hls.nextLevel` (a SMOOTH switch that takes effect at
 * the next fragment boundary) rather than `hls.currentLevel` (which flushes the
 * buffer and re-seeks). A manual pick is held `pending` until the matching
 * `LEVEL_SWITCHED` fires — the shell paints a busy "…" on the label meanwhile —
 * and the active rung's height (reported by every LEVEL_SWITCHED, including ABR
 * switches on Auto) drives the "Auto (720p)" readout. This is a deliberate
 * behaviour change from the previous hard `currentLevel` switch.
 */
export function useHlsPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  video: { id: string; hls_url?: string },
  startAt: number | null,
  // Optional HLS master URL to stream from INSTEAD of the server one — used to
  // play a video from its IPFS gateway mirror (DR5). It only overrides the HLS
  // source; the progressive fallback stays the authoritative server /original,
  // so a mid-stream IPFS failure degrades to server playback, not a dead player.
  hlsMasterOverride?: string | null,
): HlsPlayback {
  const hasHls = Boolean(video.hls_url);
  // The id of a video whose hls.js pipeline fatally failed → play its original
  // instead. Keyed by id so a navigation to another video decides afresh.
  const [failedId, setFailedId] = useState<string | null>(null);
  const [levels, setLevels] = useState<LevelOption[]>([]);
  const [currentLevel, setCurrentLevel] = useState(AUTO_LEVEL);
  // The level index a manual switch is heading to, until LEVEL_SWITCHED confirms
  // it; null when nothing is in flight (Auto/ABR or already settled).
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  // Pixel height of the rung hls.js is actually playing (last LEVEL_SWITCHED).
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const decided = useMemo(
    () => choosePlaybackMode({ hasHls, ...probeSupport() }),
    [hasHls],
  );
  const mode: PlaybackMode = failedId === video.id ? "original" : decided;

  useEffect(() => {
    if (mode !== "hls-js") return;
    const el = videoRef.current;
    if (!el) return;
    let disposed = false;
    setLevels([]);
    setCurrentLevel(AUTO_LEVEL);
    setPendingLevel(null);
    setActiveHeight(null);
    // Dynamic import: the hls.js chunk loads only when an HLS video actually
    // plays through MSE — never for original/native playback.
    void import("hls.js")
      .then(({ default: HlsClass }) => {
        if (disposed) return;
        if (!HlsClass.isSupported()) {
          setFailedId(video.id);
          return;
        }
        const hls = new HlsClass({ startPosition: startAt ?? -1 });
        hlsRef.current = hls;
        let parsed = false;
        let recoveries = 0;
        hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
          parsed = true;
          setLevels(buildLevelMenu(hls.levels));
        });
        // Every effective rung switch (ABR on Auto, or a confirmed manual pick):
        // record the active height for the "Auto (720p)" readout, and clear the
        // pending flag once the switch reaches the requested rung.
        hls.on(HlsClass.Events.LEVEL_SWITCHED, (_event, data) => {
          const height = hls.levels[data.level]?.height;
          setActiveHeight(typeof height === "number" && height > 0 ? height : null);
          setPendingLevel((p) => (p === null || data.level === p ? null : p));
        });
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          // Fatal before the manifest parsed (e.g. the playlist 404s despite
          // the detail advertising it) — or recovery exhausted: drop to the
          // original file rather than a dead player.
          if (!parsed || recoveries >= MAX_RECOVERIES) {
            hls.destroy();
            hlsRef.current = null;
            setFailedId(video.id);
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
            setFailedId(video.id);
          }
        });
        hls.loadSource(hlsMasterOverride || videoHlsMasterUrl(video.id));
        hls.attachMedia(el);
      })
      .catch(() => {
        if (!disposed) setFailedId(video.id);
      });
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [mode, video.id, videoRef, startAt, hlsMasterOverride]);

  const fragment = startAt !== null ? `#t=${startAt}` : "";
  const src =
    mode === "hls-js"
      ? undefined
      : mode === "native-hls"
        ? (hlsMasterOverride || videoHlsMasterUrl(video.id)) + fragment
        : videoOriginalUrl(video.id) + fragment;

  return {
    mode,
    src,
    levels: mode === "hls-js" ? levels : [],
    currentLevel,
    activeHeight: mode === "hls-js" ? activeHeight : null,
    pending: pendingLevel !== null,
    setLevel: (level: number) => {
      const hls = hlsRef.current;
      if (!hls) return;
      // Smooth switch at the next fragment boundary (nextLevel), not a buffer
      // flush (currentLevel). Hold the pick pending until LEVEL_SWITCHED lands.
      hls.nextLevel = level;
      setCurrentLevel(level);
      setPendingLevel(level === AUTO_LEVEL ? null : level);
    },
  };
}
