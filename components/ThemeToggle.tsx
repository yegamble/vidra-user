"use client";

import { useId } from "react";

import { t } from "@/lib/i18n";
import {
  useThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: readonly { value: ThemePreference; labelKey: "theme.light" | "theme.dark" | "theme.system" }[] = [
  { value: "light", labelKey: "theme.light" },
  { value: "system", labelKey: "theme.system" },
  { value: "dark", labelKey: "theme.dark" },
];

/**
 * ThemeToggle — an Apple-style segmented control for the appearance
 * preference (Light / System / Dark). Built on native radio inputs inside a
 * fieldset so keyboard behavior (arrow keys, form semantics) and the
 * group/option labeling come for free; the inputs are visually replaced by
 * the segment pills. "System" follows the OS, live.
 */
export function ThemeToggle() {
  const preference = useThemePreference();
  const name = useId();

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-fg">{t("theme.appearance")}</legend>
      <div className="inline-flex rounded-full bg-surface-muted p-1">
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <label
              key={option.value}
              className={`relative flex cursor-pointer items-center rounded-full px-4 py-1.5 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus ${
                selected
                  ? "bg-surface font-semibold text-fg shadow-sm"
                  : "font-medium text-fg-muted hover:text-fg"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => writeThemePreference(option.value)}
                className="sr-only"
              />
              {t(option.labelKey)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
