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
// onSeek.
//
// White fills on the media surface (design-system documented media-overlay
// exception); no new hues. 44pt tall hit area (the visible bar is thin).
export function SeekBar({
  currentTime,
  duration,
  buffered,
  onSeek,
  storyboard,
}: {
  currentTime: number;
  duration: number;
  buffered: ReadonlyArray<readonly [number, number]>;
  onSeek: (time: number) => void;
  /** The video's seek-preview storyboard, when it has one (CORE-16). */
  storyboard?: SeekStoryboard | null;
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
  // Keep the bubble fully inside the media container (its overflow clips): a
  // sprite frame is ~160px wide, so near the ends it must shift off-centre.
  const bubbleWidth = cue ? cue.w + 8 : 56;
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
    seekToFrac(frac);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    storyboard?.activate();
    const frac = fracFromEvent(e.clientX);
    if (scrubFrac !== null) {
      setScrubFrac(frac);
      seekToFrac(frac);
    } else {
      setHoverFrac(frac);
    }
  }

  function endScrub(e: React.PointerEvent<HTMLDivElement>) {
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
      aria-valuetext={seekValueText(playedTime, duration)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
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
          <span className="px-1 text-[11px] font-medium tabular-nums text-white">
            {formatDuration(tooltipTime)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
