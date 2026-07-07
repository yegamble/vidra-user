"use client";

import { useRef, useState } from "react";

import { OverlayButton } from "@/components/player/OverlayButton";
import { fractionAt, stepVolume, volumePercent } from "@/lib/player-ui";

// VolumeControl is the player's mute toggle + level slider (session-local): a
// mute OverlayButton (aria-pressed) beside a real ARIA slider (role="slider",
// aria-label="Volume"). ArrowUp/Right and ArrowDown/Left step ±5%, Home/End jump
// to 0/100. Setting a level implies unmute. The slider is hidden on the narrow
// phone overlay (mute stays; hardware volume covers the rest) and shown from sm.
export function VolumeControl({
  volume,
  muted,
  onToggleMute,
  onSetVolume,
}: {
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  onSetVolume: (level: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const pct = volumePercent(volume, muted);

  function setFromEvent(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onSetVolume(fractionAt(clientX, rect.left, rect.width));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = stepVolume(muted ? 0 : volume, 5);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = stepVolume(muted ? 0 : volume, -5);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onSetVolume(next);
  }

  return (
    <div className="flex items-center">
      <OverlayButton label={muted || pct === 0 ? "Unmute" : "Mute"} pressed={muted} onClick={onToggleMute}>
        {muted || pct === 0 ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
          </svg>
        )}
      </OverlayButton>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          trackRef.current?.setPointerCapture(e.pointerId);
          setScrubbing(true);
          setFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (scrubbing) setFromEvent(e.clientX);
        }}
        onPointerUp={(e) => {
          if (!scrubbing) return;
          trackRef.current?.releasePointerCapture(e.pointerId);
          setScrubbing(false);
        }}
        className="focus-ring group relative hidden h-11 w-16 cursor-pointer touch-none select-none items-center sm:flex"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/25">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-white"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
