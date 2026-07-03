"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { videoStoryboardImageUrl, videoStoryboardVttUrl } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cueAt, parseStoryboardVtt, type StoryboardCue } from "@/lib/storyboard";

// StoryboardPreview is a seek-hover thumbnail strip shown above the seekbar when
// a video has a generated storyboard (sprite sheet + WebVTT map). The native
// <video> owns its own seekbar, so this is a separate accessible scrubber: it
// previews the storyboard frame under the pointer/focus and seeks the player on
// click / Enter / arrow keys. It renders nothing until the VTT parses to cues.
export function StoryboardPreview({
  videoId,
  videoRef,
  durationSeconds,
}: {
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The detail's duration, used when the media element hasn't reported one yet. */
  durationSeconds?: number;
}) {
  const [cues, setCues] = useState<StoryboardCue[]>([]);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [preview, setPreview] = useState<{ time: number; cue: StoryboardCue; fraction: number } | null>(
    null,
  );
  const trackRef = useRef<HTMLDivElement>(null);
  const spriteUrl = videoStoryboardImageUrl(videoId);

  // Track the media element's duration (once known) in state — refs must not be
  // read during render, so the render-time duration comes from here / the props.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const update = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setMediaDuration(el.duration);
    };
    update();
    el.addEventListener("loadedmetadata", update);
    el.addEventListener("durationchange", update);
    return () => {
      el.removeEventListener("loadedmetadata", update);
      el.removeEventListener("durationchange", update);
    };
  }, [videoRef]);

  // Fetch + parse the storyboard VTT once. Fetching the text ourselves (rather
  // than a cross-origin <track>) matches the captions approach; a failure just
  // means no preview strip.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetch(videoStoryboardVttUrl(videoId), { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        if (cancelled || text === "") return;
        setCues(parseStoryboardVtt(text));
      })
      .catch(() => {
        // No storyboard preview — the native seekbar still works.
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [videoId]);

  // The effective duration: the media element's once known, else the detail's,
  // else the last cue's end (the storyboard always spans the whole video).
  function duration(): number {
    if (mediaDuration > 0) return mediaDuration;
    if (durationSeconds && durationSeconds > 0) return durationSeconds;
    const last = cues[cues.length - 1];
    return last ? last.end : 0;
  }

  // The playback time under a client X position on the track (clamped 0..1).
  function timeAtClientX(clientX: number): { time: number; fraction: number } {
    const el = trackRef.current;
    const total = duration();
    if (!el || total <= 0) return { time: 0, fraction: 0 };
    const rect = el.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { time: fraction * total, fraction };
  }

  function showAt(clientX: number) {
    if (cues.length === 0) return;
    const { time, fraction } = timeAtClientX(clientX);
    const cue = cueAt(cues, time);
    if (cue) setPreview({ time, cue, fraction });
  }

  function seekTo(time: number) {
    const el = videoRef.current;
    if (el) el.currentTime = time;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const total = duration();
    if (total <= 0 || cues.length === 0) return;
    const current = preview?.time ?? videoRef.current?.currentTime ?? 0;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(total, current + 5);
        break;
      case "ArrowLeft":
        next = Math.max(0, current - 5);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = total;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (preview) seekTo(preview.time);
        return;
      default:
        return;
    }
    e.preventDefault();
    const cue = cueAt(cues, next);
    if (cue) {
      setPreview({ time: next, cue, fraction: total > 0 ? next / total : 0 });
      seekTo(next);
    }
  }

  if (cues.length === 0) return null;

  const total = duration();
  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek preview"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(preview?.time ?? 0)}
      aria-valuetext={formatDuration(preview?.time ?? 0)}
      tabIndex={0}
      onPointerMove={(e) => showAt(e.clientX)}
      onPointerLeave={() => setPreview(null)}
      onBlur={() => setPreview(null)}
      onClick={(e) => {
        const { time } = timeAtClientX(e.clientX);
        seekTo(time);
      }}
      onKeyDown={onKeyDown}
      className="relative h-2 w-full cursor-pointer rounded-full bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-700"
    >
      {/* The played/hovered fill, for a visible scrub position. */}
      {preview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-zinc-500 dark:bg-zinc-400"
          style={{ width: `${preview.fraction * 100}%` }}
        />
      ) : null}
      {preview ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 z-10 -translate-x-1/2 rounded-md border border-zinc-300 bg-black p-1 shadow-lg dark:border-zinc-600"
          style={{ left: `calc(${preview.fraction * 100}% )` }}
        >
          <div
            className="rounded-sm bg-zinc-900"
            style={{
              width: `${preview.cue.w}px`,
              height: `${preview.cue.h}px`,
              backgroundImage: `url("${spriteUrl}")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: `-${preview.cue.x}px -${preview.cue.y}px`,
            }}
          />
          <div className="mt-0.5 text-center text-[11px] font-medium tabular-nums text-white">
            {formatDuration(preview.time)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
