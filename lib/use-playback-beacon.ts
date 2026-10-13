"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import { api } from "@/lib/api";

// Seconds of actual playback accumulated before a sample is sent. The server
// caps one sample at 12 s (this heartbeat plus slack) and rate-limits per
// client and video, so 10 s keeps a viewer at ~6 requests/min.
export const BEACON_INTERVAL_S = 10;
const MAX_SAMPLE_S = 12;

// A currentTime step larger than this between two timeupdate ticks is a seek,
// not playback, and must not count as watch time.
const MAX_TICK_S = 2;

/**
 * usePlaybackBeacon — anonymous watch-time samples for the creator's per-video
 * analytics (POST /videos/{id}/playback). Sends only {position, watched seconds,
 * started}: no identifier of any kind. Compose the returned handlers with the
 * shell's onPlay / onTimeUpdate / onPause. Best-effort: failures are swallowed.
 *
 * The final flush (tab hidden, pagehide, unmount) uses a keepalive fetch so it
 * survives the page going away. It reads the last position from a ref rather
 * than the element, because React has already cleared videoRef when an unmount
 * cleanup runs.
 */
export function usePlaybackBeacon(
  videoId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
) {
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  const pos = useRef(0);
  const started = useRef(false);
  const played = useRef(false);

  const flush = useCallback(
    (final: boolean) => {
      const watched = Math.min(Math.floor(acc.current), MAX_SAMPLE_S);
      // Never report a play that never started playing (e.g. unmount before play).
      if (!played.current || (watched <= 0 && started.current)) return;
      acc.current = 0;
      const first = !started.current;
      started.current = true;
      void api
        .recordPlaybackBeacon(
          videoId,
          {
            position_seconds: Math.max(0, Math.floor(pos.current)),
            watched_seconds: watched,
            started: first,
          },
          final ? { keepalive: true } : undefined,
        )
        .catch(() => {});
    },
    [videoId],
  );

  // A new video re-arms the "started" flag; leaving it (or unmounting) sends
  // whatever is pending, and a hidden tab / pagehide does the same.
  useEffect(() => {
    acc.current = 0;
    last.current = null;
    pos.current = 0;
    started.current = false;
    played.current = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        flush(true);
        last.current = null;
      }
    };
    const onPageHide = () => {
      flush(true);
      last.current = null;
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, [videoId, flush]);

  const onPlay = useCallback(() => {
    played.current = true;
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
    pos.current = t;
    if (acc.current >= BEACON_INTERVAL_S) flush(false);
  }, [flush, videoRef]);

  const onPause = useCallback(() => {
    const el = videoRef.current;
    if (el) pos.current = el.currentTime || 0;
    flush(false);
    last.current = null;
  }, [flush, videoRef]);

  return { onPlay, onTimeUpdate, onPause };
}
