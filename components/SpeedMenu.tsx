"use client";

import { PlayerMenu, type PlayerMenuVariant } from "@/components/PlayerMenu";
import { PLAYBACK_RATES, rateLabel } from "@/lib/player-rates";

// SpeedMenu is the player's playback-speed selector: a menu button ("Speed: 1×")
// opening a menu of the full 0.25×–4× rate ladder (PLAY-03) as menuitemradio
// entries driving the native video.playbackRate. Always available — every
// playback path (hls.js, native HLS, progressive original) honours the native
// rate. The rate ladder + labels live in lib/player-rates (the single shared
// source); interaction/keyboard semantics live in PlayerMenu.
export function SpeedMenu({
  speed,
  onSelect,
  variant = "bar",
}: {
  speed: number;
  onSelect: (rate: number) => void;
  variant?: PlayerMenuVariant;
}) {
  return (
    <PlayerMenu
      buttonLabel={`Speed: ${rateLabel(speed)}`}
      buttonText={rateLabel(speed)}
      menuLabel="Playback speed"
      variant={variant}
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
