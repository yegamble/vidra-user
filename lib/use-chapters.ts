"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type VideoChapter } from "@/lib/api";
import { chapterAt } from "@/lib/chapters";

// A stable empty set so the "not loaded yet" list keeps a constant identity (no
// per-render churn of the memoised lookup / return object).
const EMPTY: VideoChapter[] = [];

// A resolved chapter set the seek bar and readout consume: the ascending chapter
// list (for the tick markers) plus a by-time lookup (for the scrub bubble title,
// the aria-valuetext, and the current-chapter readout). Null when the video has
// no chapters — the seek bar then paints no ticks and the readout shows nothing.
export interface SeekChapters {
  /** The video's chapters, ascending by start_seconds (empty until they load). */
  chapters: VideoChapter[];
  /** The chapter covering `time` (seconds), or null before the first / while loading. */
  chapterAt(time: number): VideoChapter | null;
}

/**
 * useChapters resolves a video's seek-bar chapters (CORE-15) for the player shell.
 * Unlike the storyboard (lazy on first hover), chapters are fetched eagerly on
 * mount when the detail's `hasChapters` flag is set, because the tick markers and
 * the current-chapter readout must render without any interaction. A missing/
 * failed fetch just yields an empty set (the bar still works), and the hook
 * returns null when the video advertises no chapters, so the caller passes
 * `undefined` to the seek bar (no ticks, plain tooltip).
 *
 * The loaded set is tagged with the videoId it was fetched for, so a src switch on
 * the still-mounted shell transparently ignores the previous video's chapters and
 * refetches for the new one — no effect-time state reset needed.
 */
export function useChapters(
  videoId: string,
  hasChapters: boolean | undefined,
): SeekChapters | null {
  const [loaded, setLoaded] = useState<{ videoId: string; chapters: VideoChapter[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!hasChapters) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const id = videoId;
    api
      .getVideoChapters(id, undefined, controller.signal)
      .then((res) => setLoaded({ videoId: id, chapters: res.chapters }))
      .catch(() => {
        // No ticks / no titles — the seek bar still scrubs and reads out the time.
      });
    return () => controller.abort();
  }, [videoId, hasChapters]);

  const list = useMemo(
    () => (loaded && loaded.videoId === videoId ? loaded.chapters : EMPTY),
    [loaded, videoId],
  );
  const lookup = useCallback((time: number) => chapterAt(list, time), [list]);

  return useMemo(() => {
    if (!hasChapters) return null;
    return { chapters: list, chapterAt: lookup };
  }, [hasChapters, list, lookup]);
}
