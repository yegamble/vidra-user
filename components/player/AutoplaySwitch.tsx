"use client";

import { PlayGlyph, PauseGlyph } from "@/components/player/icons";
import { usePlayerTipProps } from "@/components/player/PlayerTooltip";
import { cn } from "@/lib/cn";

/**
 * AutoplaySwitch — the one autoplay-next control, used by the control bar and
 * the end card.
 *
 * It exists because the old bar toggle was an icon with `aria-pressed` and no
 * visible difference between on and off: "the autoplay button gives no
 * indication of whether it is on or off" was the owner's complaint, and it was
 * accurate for sighted and AT users alike. A switch answers it three times
 * over — `role="switch"` + `aria-checked` for assistive tech, the knob's
 * position and the track's fill for a glance, and a tiny DARK glyph riding on
 * the knob (play when autoplay will continue, pause when it will stop) for the
 * viewer who cannot tell which end of a track means "on".
 *
 * Media-overlay colours throughout (white on video; the documented exception),
 * and a 44pt-tall hit area around a 36×14 track.
 */
export function AutoplaySwitch({
  enabled,
  onToggle,
  label,
  showText = false,
  className,
}: {
  enabled: boolean;
  onToggle: () => void;
  /**
   * Accessible name. Defaults to the state sentence ("Autoplay is on/off") the
   * bar uses, where the control is icon-only; the end card passes a stable
   * "Autoplay next" instead, so its name does not change under the viewer.
   */
  label?: string;
  /** Show the word "Autoplay" beside the track (the end card does; the bar does not). */
  showText?: boolean;
  className?: string;
}) {
  const state = enabled ? "Autoplay is on" : "Autoplay is off";
  const tipProps = usePlayerTipProps<HTMLButtonElement>(state, undefined, { onClick: onToggle });

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label ?? state}
      className={cn(
        "focus-ring-media inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-2 text-[12px] font-medium text-white/90",
        "transition-colors duration-150 ease-out hover:text-white motion-reduce:transition-none",
        className,
      )}
      {...tipProps}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-3.5 w-9 items-center rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none",
          enabled ? "bg-white/80" : "bg-white/30",
        )}
      >
        {/* The knob overlaps the track vertically (20px on a 14px rail), which
            is what makes it read as a physical switch rather than a filled
            progress track. */}
        <span
          className={cn(
            "absolute top-1/2 left-0 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
            "transition-transform duration-150 ease-out motion-reduce:transition-none",
            enabled ? "translate-x-4" : "translate-x-0",
          )}
        >
          {enabled ? (
            <PlayGlyph size={11} data-knob-glyph="play" className="text-black/80" />
          ) : (
            <PauseGlyph size={11} data-knob-glyph="pause" className="text-black/80" />
          )}
        </span>
      </span>
      {showText ? <span>Autoplay</span> : null}
    </button>
  );
}
