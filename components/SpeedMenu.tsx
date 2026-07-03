"use client";

import { PlayerMenu } from "@/components/PlayerMenu";

// The selectable playback rates (native video.playbackRate), 0.25×–2×.
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function rateLabel(rate: number): string {
  return rate === 1 ? "Normal" : `${rate}×`;
}

// SpeedMenu is the player's playback-speed selector: a menu button
// ("Speed: Normal") opening a menu of 0.25×–2× rates. Always available — every
// playback path (hls.js, native HLS, progressive original) honours the native
// video.playbackRate. Interaction/keyboard semantics live in PlayerMenu.
export function SpeedMenu({
  speed,
  onSelect,
}: {
  speed: number;
  onSelect: (rate: number) => void;
}) {
  return (
    <PlayerMenu
      buttonLabel={`Speed: ${rateLabel(speed)}`}
      menuLabel="Playback speed"
      icon={
        // Minified inline gauge icon
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0z" />
        </svg>
      }
      items={PLAYBACK_RATES.map((rate) => ({ value: rate, label: rateLabel(rate) }))}
      current={speed}
      onSelect={onSelect}
    />
  );
}
