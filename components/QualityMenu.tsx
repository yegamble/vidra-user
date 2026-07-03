"use client";

import { PlayerMenu } from "@/components/PlayerMenu";
import type { LevelOption } from "@/lib/hls";

// QualityMenu is the player's quality selector: a menu button ("Quality: Auto")
// opening a menu of Auto + one entry per rendition height, driving hls.js level
// selection. Rendered only for hls.js playback — native-HLS and original
// playback expose nothing controllable, so the menu hides there (the caller
// passes no levels). Interaction/keyboard semantics live in PlayerMenu.
export function QualityMenu({
  levels,
  currentLevel,
  onSelect,
}: {
  levels: LevelOption[];
  currentLevel: number;
  onSelect: (level: number) => void;
}) {
  if (levels.length === 0) return null;

  const currentLabel = levels.find((l) => l.level === currentLevel)?.label ?? "Auto";

  return (
    <PlayerMenu
      buttonLabel={`Quality: ${currentLabel}`}
      menuLabel="Playback quality"
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
