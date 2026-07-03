"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import type Hls from "hls.js";

import { canPlayNativeHls } from "@/lib/hls";
import { chooseRemotePlaybackMode, type RemotePlaybackMode } from "@/lib/remote-playback";

export interface RemotePlayback {
  /** The decided mode; "none" means nothing is playable — link out instead. */
  mode: RemotePlaybackMode;
  /** src for the media element; undefined while hls.js owns it via MSE (or mode none). */
  src: string | undefined;
}

// probeSupport sniffs the browser's HLS capabilities once per call site (same
// approach as lib/use-hls-playback.ts).
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
 * useRemotePlayback wires a media element to a remote video's origin stream_url:
 * hls.js (dynamically imported) for .m3u8 URLs when MSE exists, native HLS
 * without MSE (iOS Safari), a plain <video src> for direct files, and "none"
 * when the origin advertised nothing playable. Unlike local playback there is
 * no /original fallback — a fatal hls.js failure degrades to "none" and the
 * caller keeps its "Watch on <origin>" link as the honest path.
 */
export function useRemotePlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  video: { id: string; stream_url?: string },
): RemotePlayback {
  // The id of a video whose hls.js pipeline fatally failed → no local playback.
  // Keyed by id so navigating to another remote video decides afresh.
  const [failedId, setFailedId] = useState<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const streamUrl = video.stream_url;
  const decided = useMemo(
    () => chooseRemotePlaybackMode({ streamUrl, ...probeSupport() }),
    [streamUrl],
  );
  const mode: RemotePlaybackMode = failedId === video.id ? "none" : decided;

  useEffect(() => {
    if (mode !== "hls-js" || !streamUrl) return;
    const el = videoRef.current;
    if (!el) return;
    let disposed = false;
    // Dynamic import: the hls.js chunk loads only when a remote HLS stream
    // actually plays through MSE.
    void import("hls.js")
      .then(({ default: HlsClass }) => {
        if (disposed) return;
        if (!HlsClass.isSupported()) {
          setFailedId(video.id);
          return;
        }
        const hls = new HlsClass();
        hlsRef.current = hls;
        hls.on(HlsClass.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          // The origin's stream is not under our control — do not retry-loop
          // against a broken/blocked remote; drop to the link-out path.
          hls.destroy();
          hlsRef.current = null;
          setFailedId(video.id);
        });
        hls.loadSource(streamUrl);
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
  }, [mode, streamUrl, video.id, videoRef]);

  const src = mode === "native-hls" || mode === "direct" ? streamUrl : undefined;
  return { mode, src };
}
