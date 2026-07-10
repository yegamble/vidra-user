"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional trailing count (e.g. queue sizes), rendered in muted tabular-nums. */
  count?: number;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  /** The selected value. */
  value: T;
  /** Called with the chosen value on click (fires for the active segment too). */
  onChange: (value: T) => void;
  /** Accessible group name. Provide this OR `labelledBy`. */
  label?: string;
  /** Id of a visible element naming the group (wins over `label` when set). */
  labelledBy?: string;
  size?: "sm" | "md";
  /** Stretch to fill the row with equal-width segments (e.g. Inbox tabs). */
  fullWidth?: boolean;
  /** Disable every segment (e.g. while a role change is saving). */
  disabled?: boolean;
  className?: string;
};

const SEGMENT_SIZE = {
  sm: "min-h-11 px-3.5 py-1 text-[13px] sm:min-h-8",
  md: "min-h-11 px-4 py-1.5 text-[13px] sm:min-h-9",
} as const;

/**
 * SegmentedControl — the design's rounded-rect segmented switcher (a muted
 * `rounded-[10px]` track with a raised, shadowed active segment). Replaces the
 * app's former pill-shaped segmented controls (ThemeToggle, FeedScopeToggle) and
 * seeds the Inbox / Queues / Content tabs.
 *
 * Semantics: a `role="group"` of `aria-pressed` toggle buttons (single-select).
 * Buttons are Tab-navigable and activate on Enter/Space/click — the same model
 * the existing feed-scope switcher ships (and its e2e asserts), so migrating to
 * this primitive is behaviour-preserving. Provide a name via `label`
 * (→ aria-label) or `labelledBy` (→ aria-labelledby, for a visible heading).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  size = "md",
  fullWidth = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn(
        "items-center rounded-[10px] bg-surface-muted p-[3px]",
        fullWidth ? "flex w-full" : "inline-flex",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (option.value !== value) onChange(option.value);
            }}
            className={cn(
              "focus-ring inline-flex min-w-11 items-center justify-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 sm:min-w-0",
              SEGMENT_SIZE[size],
              fullWidth && "flex-1",
              active
                ? "bg-canvas font-semibold text-fg shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 tabular-nums text-fg-muted">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
