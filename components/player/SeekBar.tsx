"use client";

import { useEffect, useRef, useState } from "react";

import { formatDuration } from "@/lib/format";
import {
  bufferedBands,
  clampBubbleLeft,
  fractionAt,
  fractionOfTime,
  seekValueText,
  timeAtFraction,
} from "@/lib/player-ui";
import type { SeekChapters } from "@/lib/use-chapters";
import type { SeekStoryboard } from "@/lib/use-storyboard";

// SeekBar is the player's scrub control: a single track painting buffered ranges
// (a lighter band) under the played progress and playhead, with pointer scrub,
// a hover/focus scrub bubble, and full keyboard operability. It is a real ARIA
// slider (role="slider", tabIndex=0, aria-valuemin/max/now + aria-valuetext
// "1:23 of 12:40"): ArrowLeft/Right step ±5s, Home/End jump to the ends, and a
// focused slider shows the same bubble as hover (keyboard parity).
//
// The scrub bubble shows the timestamp and — when the video has a storyboard —
// the sprite frame under the pointer/playhead (CORE-16). The storyboard is
// lazy: the bar calls storyboard.activate() on the first hover/focus, so the VTT
// map (and, once a frame paints, the sprite sheet) only load when a preview is
// actually needed. Without a storyboard the bubble degrades to the timestamp
// alone. Controlled — the shell owns the media state and applies seeks via
// onSeek. Pointer drags only update the local preview; the media seek is
// committed once on release so an MSE-backed stream does not flush and refetch
// fragments for every pointermove event.
//
// White fills on the media surface (design-system documented media-overlay
// exception); no new hues. 44pt tall hit area (the visible bar is thin).
export function SeekBar({
  currentTime,
  duration,
  buffered,
  onSeek,
  storyboard,
  chapters,
}: {
  currentTime: number;
  duration: number;
  buffered: ReadonlyArray<readonly [number, number]>;
  onSeek: (time: number) => void;
  /** The video's seek-preview storyboard, when it has one (CORE-16). */
  storyboard?: SeekStoryboard | null;
  /** The video's seek-bar chapters, when it has any (CORE-15). */
  chapters?: SeekChapters | null;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const playedFrac = scrubFrac ?? fractionOfTime(currentTime, duration);
  const playedTime = scrubFrac !== null ? timeAtFraction(scrubFrac, duration) : currentTime;
  const bands = bufferedBands(buffered, duration);

  // Which position the bubble tracks: the live scrub, else the hovered point,
  // else the playhead while focused (keyboard parity), else hidden.
  const tooltipFrac =
    scrubFrac ?? hoverFrac ?? (focused ? fractionOfTime(currentTime, duration) : null);
  const tooltipTime = tooltipFrac === null ? 0 : timeAtFraction(tooltipFrac, duration);
  // The storyboard frame under the bubble position (null until cues load / no
  // storyboard) — the bubble still shows the timestamp either way.
  const cue = tooltipFrac === null ? null : (storyboard?.cueAt(tooltipTime) ?? null);
  // The chapter under the bubble position (CORE-15): its title joins the bubble;
  // the chapter at the PLAYHEAD drives the aria-valuetext so a keyboard user hears
  // the section they are seeking within.
  const bubbleChapter = tooltipFrac === null ? null : (chapters?.chapterAt(tooltipTime) ?? null);
  const playheadChapter = chapters?.chapterAt(playedTime) ?? null;
  // Keep the bubble fully inside the media container (its overflow clips): a
  // sprite frame is ~160px wide, so near the ends it must shift off-centre. A
  // chapter title (no frame) widens the time-only chip too.
  const bubbleWidth = cue ? cue.w + 8 : bubbleChapter ? 160 : 56;
  const bubbleLeftPx = clampBubbleLeft(tooltipFrac ?? 0, trackWidth, bubbleWidth);

  // Measure the track so the bubble can be edge-clamped in pixels; ResizeObserver
  // keeps it correct across layout/fullscreen changes. jsdom has neither layout
  // nor ResizeObserver, so trackWidth stays 0 there (the bubble falls back to a
  // simple percentage position) — the pixel clamp is exercised in real browsers.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackWidth(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function fracFromEvent(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return fractionAt(clientX, rect.left, rect.width);
  }

  function seekToFrac(frac: number) {
    if (!hasDuration) return;
    onSeek(timeAtFraction(frac, duration));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    storyboard?.activate();
    trackRef.current?.setPointerCapture(e.pointerId);
    const frac = fracFromEvent(e.clientX);
    setScrubFrac(frac);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    storyboard?.activate();
    const frac = fracFromEvent(e.clientX);
    if (scrubFrac !== null) {
      setScrubFrac(frac);
    } else {
      setHoverFrac(frac);
    }
  }

  function commitScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (scrubFrac === null) return;
    trackRef.current?.releasePointerCapture(e.pointerId);
    seekToFrac(fracFromEvent(e.clientX));
    setScrubFrac(null);
  }

  function cancelScrub(e: React.PointerEvent<HTMLDivElement>) {
    if (scrubFrac === null) return;
    trackRef.current?.releasePointerCapture(e.pointerId);
    setScrubFrac(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!hasDuration) return;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        next = Math.min(duration, currentTime + 5);
        break;
      case "ArrowLeft":
        next = Math.max(0, currentTime - 5);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = duration;
        break;
      default:
        return;
    }
    e.preventDefault();
    onSeek(next);
  }

  // Pixel clamp once the track is measured; a plain percentage otherwise (jsdom /
  // pre-layout). Both keep the bubble centred on the pointer via -translate-x-1/2.
  const bubbleStyle =
    trackWidth > 0
      ? { left: `${bubbleLeftPx}px` }
      : { left: `${(tooltipFrac ?? 0) * 100}%` };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={hasDuration ? Math.round(duration) : 0}
      aria-valuenow={Math.round(playedTime)}
      aria-valuetext={seekValueText(playedTime, duration, playheadChapter?.title)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={commitScrub}
      onPointerCancel={cancelScrub}
      onPointerLeave={() => setHoverFrac(null)}
      onFocus={() => {
        setFocused(true);
        storyboard?.activate();
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      className="focus-ring group relative flex h-11 w-full cursor-pointer touch-none select-none items-center"
    >
      {/* The thin track line, centered in the tall hit area. */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover:h-2">
        {/* Buffered ranges: a lighter band under the playhead. */}
        {bands.map((b, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="absolute inset-y-0 bg-white/30"
            style={{ left: `${b.left * 100}%`, width: `${b.width * 100}%` }}
          />
        ))}
        {/* Played progress. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-white"
          style={{ width: `${playedFrac * 100}%` }}
        />
      </div>
      {/* Chapter boundary ticks (CORE-15): a thin white notch with a subtle dark
          ring so it reads over both the played (white) fill and any video frame.
          Rendered outside the clipped track so it can poke past the thin line; the
          whole 44pt-tall bar is the pointer target, so the small visual is enough.
          The tick at 0s (left edge) and any past the duration are skipped. */}
      {chapters && hasDuration
        ? chapters.chapters
            .filter((c) => c.start_seconds > 0 && c.start_seconds < duration)
            .map((c) => (
              <div
                key={c.start_seconds}
                data-testid="chapter-tick"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 ring-1 ring-black/30"
                style={{ left: `${(c.start_seconds / duration) * 100}%` }}
              />
            ))
        : null}
      {/* Playhead knob. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        style={{ left: `${playedFrac * 100}%` }}
      />
      {/* Scrub bubble (hover / scrub / keyboard focus): a media thumbnail-style
          black chip so it stays readable over any frame (media-overlay exception).
          Shows the storyboard sprite frame above the timestamp when one exists. */}
      {tooltipFrac !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 z-10 flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg bg-black/80 p-1 shadow-lg"
          style={bubbleStyle}
        >
          {cue && storyboard ? (
            <div
              className="overflow-hidden rounded-md ring-1 ring-white/15"
              style={{
                width: `${cue.w}px`,
                height: `${cue.h}px`,
                backgroundImage: `url("${storyboard.spriteUrl}")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: `-${cue.x}px -${cue.y}px`,
              }}
            />
          ) : null}
          {bubbleChapter ? (
            <span className="max-w-[10rem] truncate px-1 text-[11px] font-medium text-white/90">
              {bubbleChapter.title}
            </span>
          ) : null}
          <span className="px-1 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(tooltipTime)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
