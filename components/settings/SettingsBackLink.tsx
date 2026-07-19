import Link from "next/link";

import { ChevronLeftIcon } from "@/components/icons";

// The mobile drill-in back affordance at the top of every settings sub-page.
// Hidden at ≥ lg, where the SettingsRail is the section nav; below lg it is the
// way back up to the settings index (the bottom-tab bar has no settings tab).
export function SettingsBackLink() {
  return (
    <Link
      href="/settings"
      className="focus-ring mb-4 -ml-1 inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 text-[15px] font-medium text-accent-text transition-colors hover:bg-surface-muted lg:hidden"
    >
      <ChevronLeftIcon size={18} />
      Settings
    </Link>
  );
}
