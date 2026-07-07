"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { videoStoryboardImageUrl, videoStoryboardVttUrl } from "@/lib/api";
import { cueAt, parseStoryboardVtt, type StoryboardCue } from "@/lib/storyboard";

// A resolved storyboard the seek bar can preview from: a sprite-rect lookup by
// playback time, the sprite sheet URL, and a lazy `activate()` the bar calls on
// the FIRST hover/focus so the VTT (and, once a cue paints, the sprite image)
// only load when a preview is actually needed. Null when the video has no
// storyboard — the seek tooltip then degrades to the timestamp alone.
export interface SeekStoryboard {
  /** The sprite rectangle covering `time` (seconds), or null until cues load. */
  cueAt(time: number): StoryboardCue | null;
  /** The sprite sheet URL, used as the preview tile's background-image. */
  spriteUrl: string;
  /** Trigger the one-time lazy fetch of the VTT map (idempotent, safe to spam). */
  activate(): void;
}

/**
 * useStoryboard resolves a video's seek-preview storyboard for the player shell.
 * It fetches NOTHING until `activate()` is first called (the seek bar calls it on
 * hover/focus), matching the caption approach of pulling the VTT ourselves rather
 * than via a cross-origin <track>. A missing/failed VTT just yields no cues, so
 * the tooltip still shows the timestamp. Returns null when the detail's
 * has_storyboard flag is false — the caller passes `undefined` to the seek bar,
 * which then renders its plain time-only tooltip.
 *
 * Loaded cues are tagged with the videoId they were fetched for, so a switch to a
 * new video (same mounted shell) transparently ignores the previous video's cues
 * and re-activates lazily on the next preview — no effect-time state reset needed.
 */
export function useStoryboard(
  videoId: string,
  hasStoryboard: boolean | undefined,
): SeekStoryboard | null {
  const [loaded, setLoaded] = useState<{ videoId: string; cues: StoryboardCue[] } | null>(null);
  // The videoId we've already kicked a fetch for (null = none yet); guards the
  // one-time lazy load per video without a state reset.
  const activatedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight fetch on unmount so a late resolve can't setState on a
  // gone component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const activate = useCallback(() => {
    if (!hasStoryboard || activatedRef.current === videoId) return;
    activatedRef.current = videoId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = videoId;
    fetch(videoStoryboardVttUrl(id), { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (text !== "") setLoaded({ videoId: id, cues: parseStoryboardVtt(text) });
      })
      .catch(() => {
        // No preview frames — the seek tooltip still shows the timestamp.
      });
  }, [videoId, hasStoryboard]);

  const spriteUrl = videoStoryboardImageUrl(videoId);
  const lookup = useCallback(
    (time: number) => {
      if (!loaded || loaded.videoId !== videoId || loaded.cues.length === 0) return null;
      return cueAt(loaded.cues, time);
    },
    [loaded, videoId],
  );

  return useMemo(() => {
    if (!hasStoryboard) return null;
    return { cueAt: lookup, spriteUrl, activate };
  }, [hasStoryboard, lookup, spriteUrl, activate]);
}
