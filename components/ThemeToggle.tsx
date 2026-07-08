"use client";

import { useId } from "react";

import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { t } from "@/lib/i18n";
import {
  useThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

/**
 * ThemeToggle — the appearance preference (Light / System / Dark) on the shared
 * rounded-rect SegmentedControl. "System" follows the OS, live. A visible
 * heading names the group (aria-labelledby), so it reads as "Appearance" to AT.
 */
export function ThemeToggle() {
  const preference = useThemePreference();
  const labelId = useId();

  const options: readonly SegmentedOption<ThemePreference>[] = [
    { value: "light", label: t("theme.light") },
    { value: "system", label: t("theme.system") },
    { value: "dark", label: t("theme.dark") },
  ];

  return (
    <div>
      <p id={labelId} className="mb-2 text-sm font-medium text-fg">
        {t("theme.appearance")}
      </p>
      <SegmentedControl
        options={options}
        value={preference}
        onChange={writeThemePreference}
        labelledBy={labelId}
      />
    </div>
  );
}
