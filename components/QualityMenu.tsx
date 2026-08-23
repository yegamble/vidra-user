"use client";

import { PlayerMenu, type PlayerMenuVariant } from "@/components/PlayerMenu";
import { qualityLabel, type LevelOption } from "@/lib/hls";
import { qualityKey, type QualitySelection } from "@/lib/quality-id";

// QualityMenu is the player's quality/resolution selector: a menu button
// ("Quality: Auto") opening a menu of Auto + one entry per rendition height.
// Rendered only where quality is actually selectable — native-HLS and original
// playback expose nothing controllable, so the menu hides there (the caller
// passes no levels).
//
// Entries are keyed by the canonical QualityId string, which is what crosses
// into the DOM as the menu value; the selection handed back to the caller is the
// structured id, so nothing outside the engine adapter ever handles a level
// index. PlayerMenu is generic over string|number values and keys its rows by
// `item.value`, so string ids drop straight in.
//
// The visible label reflects the smooth-switch state: the picked rung with a
// busy "…" until the engine confirms it (`pending`), and "Auto (720p)" once
// the active ABR rung height is known (`activeHeight`). Interaction/keyboard
// semantics live in PlayerMenu.
export function QualityMenu({
  levels,
  currentQuality,
  activeHeight = null,
  pending = false,
  onSelect,
  variant = "bar",
}: {
  levels: LevelOption[];
  currentQuality: QualitySelection;
  /** Active ABR rung height (for the "Auto (720p)" readout); omit where unknown. */
  activeHeight?: number | null;
  /** True while a manual smooth switch is in flight (paints a busy "…"); omit if N/A. */
  pending?: boolean;
  onSelect: (quality: QualitySelection) => void;
  variant?: PlayerMenuVariant;
}) {
  if (levels.length === 0) return null;

  const label = qualityLabel({ levels, selected: currentQuality, activeHeight, pending });

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
      items={levels.map((l) => ({ value: l.value, label: l.label }))}
      current={qualityKey(currentQuality)}
      onSelect={(value) => {
        // Resolve the DOM value back to the entry's structured id rather than
        // re-parsing the string: the menu already holds the authoritative one.
        const picked = levels.find((l) => l.value === value);
        if (picked) onSelect(picked.id);
      }}
    />
  );
}
