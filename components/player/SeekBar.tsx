"use client";

import { useRef, useState } from "react";

import { formatDuration } from "@/lib/format";
import {
  bufferedBands,
  fractionAt,
  fractionOfTime,
  seekValueText,
  timeAtFraction,
} from "@/lib/player-ui";

// SeekBar is the player's scrub control: a single track painting buffered ranges
// (a lighter band) under the played progress and playhead, with pointer scrub,
// a hover/focus timestamp tooltip, and full keyboard operability. It is a real
// ARIA slider (role="slider", tabIndex=0, aria-valuemin/max/now + aria-valuetext
// "1:23 of 12:40"): ArrowLeft/Right step ±5s, Home/End jump to the ends, and a
// focused slider shows the same tooltip as hover (keyboard parity). Controlled —
// the shell owns the media state and applies seeks via onSeek.
//
// White fills on the media surface (design-system documented media-overlay
// exception); no new hues. 44pt tall hit area (the visible bar is thin).
export function SeekBar({
  currentTime,
  duration,
  buffered,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  buffered: ReadonlyArray<readonly [number, number]>;
  onSeek: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const [hoverFrac, setHoverFrac] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const playedFrac = scrubFrac ?? fractionOfTime(currentTime, duration);
  const playedTime = scrubFrac !== null ? timeAtFraction(scrubFrac, duration) : currentTime;
  const bands = bufferedBands(buffered, duration);

  // Which position the tooltip tracks: the live scrub, else the hovered point,
  // else the playhead while focused (keyboard parity), else hidden.
  const tooltipFrac =
    scrubFrac ?? hoverFrac ?? (focused ? fractionOfTime(currentTime, duration) : null);
  const tooltipTime = tooltipFrac === null ? 0 : timeAtFraction(tooltipFrac, duration);

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
    trackRef.current?.setPointerCapture(e.pointerId);
    const frac = fracFromEvent(e.clientX);
    setScrubFrac(frac);
    seekToFrac(frac);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
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
      onFocus={() => setFocused(true)}
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
      {/* Time tooltip (hover / scrub / keyboard focus). A media thumbnail-style
          black chip so it stays readable over any frame (media-overlay exception). */}
      {tooltipFrac !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 z-10 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white shadow-lg"
          style={{ left: `${tooltipFrac * 100}%` }}
        >
          {formatDuration(tooltipTime)}
        </div>
      ) : null}
    </div>
  );
}
