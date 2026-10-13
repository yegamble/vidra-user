"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { api } from "@/lib/api";

// Seconds of actual playback accumulated before a sample is sent. The server
// caps one sample at 30 s and rate-limits per client, so 10 s keeps a viewer
// at ~6 requests/min.
export const BEACON_INTERVAL_S = 10;

// A currentTime step larger than this between two timeupdate ticks is a seek,
// not playback, and must not count as watch time.
const MAX_TICK_S = 2;

/**
 * usePlaybackBeacon — anonymous watch-time samples for the creator's per-video
 * analytics (POST /videos/{id}/playback). Sends only {position, watched seconds,
 * started}: no identifier of any kind. Compose the returned handlers with the
 * shell's onPlay / onTimeUpdate / onPause. Best-effort: failures are swallowed.
 */
export function usePlaybackBeacon(
  videoId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  const started = useRef(false);

  const flush = useCallback(() => {
    const el = videoRef.current;
    const watched = Math.min(Math.floor(acc.current), 30);
    if (!el || (watched <= 0 && started.current)) return;
    acc.current -= watched;
    const first = !started.current;
    started.current = true;
    void api
      .recordPlaybackBeacon(videoId, {
        position_seconds: Math.max(0, Math.floor(el.currentTime || 0)),
        watched_seconds: watched,
        started: first,
      })
      .catch(() => {});
  }, [videoId, videoRef]);

  // A new video re-arms the "started" flag and drops any partial sample.
  useEffect(() => {
    acc.current = 0;
    last.current = null;
    started.current = false;
    return () => {
      flush();
    };
  }, [videoId, flush]);

  const onPlay = useCallback(() => {
    last.current = videoRef.current?.currentTime ?? null;
  }, [videoRef]);

  const onTimeUpdate = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const t = el.currentTime || 0;
    if (last.current !== null) {
      const d = t - last.current;
      if (d > 0 && d <= MAX_TICK_S) acc.current += d;
    }
    last.current = t;
    if (acc.current >= BEACON_INTERVAL_S) flush();
  }, [flush, videoRef]);

  const onPause = useCallback(() => {
    flush();
    last.current = null;
  }, [flush]);

  return { onPlay, onTimeUpdate, onPause };
}
