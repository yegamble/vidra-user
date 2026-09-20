"use client";

import { useRef, useState } from "react";

import { VolumeHighGlyph, VolumeLowGlyph, VolumeMutedGlyph } from "@/components/player/icons";
import { OverlayButton } from "@/components/player/OverlayButton";
import { CONTROL_SHORTCUT_KEYS } from "@/lib/player-shortcuts";
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
      <OverlayButton
        label={muted || pct === 0 ? "Unmute" : "Mute"}
        tipKeys={CONTROL_SHORTCUT_KEYS.mute}
        pressed={muted}
        onClick={onToggleMute}
      >
        {/* Three states, not two: a speaker with one wave at low volume is how
            the glyph tells you the level is set, not just that sound is on. */}
        {muted || pct === 0 ? (
          <VolumeMutedGlyph />
        ) : pct < 50 ? (
          <VolumeLowGlyph />
        ) : (
          <VolumeHighGlyph />
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
        className="focus-ring-media group relative hidden h-11 w-16 cursor-pointer touch-none select-none items-center rounded-full sm:flex"
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-150 ease-out group-hover:h-1.5 group-focus-within:h-1.5 motion-reduce:transition-none">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-white"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
