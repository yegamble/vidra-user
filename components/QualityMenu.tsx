"use client";

import { PlayerMenu, type PlayerMenuVariant } from "@/components/PlayerMenu";
import { qualityLabel, type LevelOption } from "@/lib/hls";

// QualityMenu is the player's quality/resolution selector: a menu button
// ("Quality: Auto") opening a menu of Auto + one entry per rendition height,
// driving hls.js level selection via hls.nextLevel (smooth switch). Rendered
// only for hls.js playback — native-HLS and original playback expose nothing
// controllable, so the menu hides there (the caller passes no levels).
//
// The visible label reflects the smooth-switch state: the picked rung with a
// busy "…" until LEVEL_SWITCHED confirms it (`pending`), and "Auto (720p)" once
// the active ABR rung height is known (`activeHeight`). Interaction/keyboard
// semantics live in PlayerMenu.
export function QualityMenu({
  levels,
  currentLevel,
  activeHeight = null,
  pending = false,
  onSelect,
  variant = "bar",
}: {
  levels: LevelOption[];
  currentLevel: number;
  /** Active ABR rung height (for the "Auto (720p)" readout); omit where unknown. */
  activeHeight?: number | null;
  /** True while a manual smooth switch is in flight (paints a busy "…"); omit if N/A. */
  pending?: boolean;
  onSelect: (level: number) => void;
  variant?: PlayerMenuVariant;
}) {
  if (levels.length === 0) return null;

  const label = qualityLabel({ levels, selected: currentLevel, activeHeight, pending });

  return (
    <PlayerMenu
      buttonLabel={`Quality: ${label}`}
      buttonText={label}
      menuLabel="Playback quality"
      variant={variant}
      icon={
        // Minified inline sliders icon
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      }
      items={levels.map((l) => ({ value: l.level, label: l.label }))}
      current={currentLevel}
      onSelect={onSelect}
    />
  );
}
