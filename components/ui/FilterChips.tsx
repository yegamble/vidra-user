"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The design's **content filter chip** recipe (design-system.md § Component
 * patterns): a pill that narrows or reorders the content below it — solid
 * accent fill when applied, outlined when not. Deliberately NOT the
 * `SegmentedControl` rounded-rect track: that primitive is the *section
 * switcher* recipe, and the design system forbids mixing the two.
 *
 * This replaces three hand-rolled copies of the same button — `FilterButton` in
 * `ModerationQueue`, a second `FilterButton` in `AdminRegistrationRequestsView`,
 * and `FilterChip` in `AdminUsersView` — which had drifted to three different
 * paddings, three type sizes, and an inactive-only border that made the active
 * chip jump 1px. Both borders are declared here so the row never reflows.
 */

export type FilterChipSize = "sm" | "md";

const CHIP_SIZE: Record<FilterChipSize, string> = {
  // sm — dense facet rows (the Users All/Staff/Deactivated pills).
  sm: "px-3 py-1.5 text-[12.5px]",
  // md — the standard filter row (Open/All, Pending/All).
  md: "px-4 py-1.5 text-[13px]",
};

export type FilterChipProps = {
  /** Whether this filter is applied. Carried to assistive tech as aria-pressed. */
  active: boolean;
  onClick: () => void;
  size?: FilterChipSize;
  disabled?: boolean;
  /**
   * Overrides the accessible name. Needed whenever the chip's text is more than
   * one node: the accessible-name algorithm trims each node before joining, so
   * a `label` + ` · 4649` chip otherwise announces as "All· 4649".
   */
  "aria-label"?: string;
  className?: string;
  children: ReactNode;
};

/**
 * FilterChip — one filter pill. Use `FilterChipGroup` for the common
 * single-select row; reach for the bare chip only when the set is multi-select
 * or the options are not a fixed list.
 */
export function FilterChip({
  active,
  onClick,
  size = "md",
  disabled = false,
  "aria-label": ariaLabel,
  className,
  children,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focus-ring rounded-full border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
        CHIP_SIZE[size],
        active
          ? "border-accent bg-accent text-accent-fg"
          : "border-border text-fg-muted hover:bg-surface-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type FilterChipOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional trailing count, rendered as `· 42` in tabular-nums. */
  count?: number;
};

export type FilterChipGroupProps<T extends string> = {
  options: readonly FilterChipOption<T>[];
  /** The applied value. */
  value: T;
  /** Called with the chosen value. Not fired when the active chip is re-clicked. */
  onChange: (value: T) => void;
  /** Accessible group name ("Filter reports"). Provide this OR `labelledBy`. */
  label?: string;
  /** Id of a visible element naming the group (wins over `label`). */
  labelledBy?: string;
  size?: FilterChipSize;
  disabled?: boolean;
  className?: string;
};

/**
 * FilterChipGroup — a single-select row of filter chips: `role="group"` with a
 * name, `aria-pressed` per chip, ordinary Tab/Enter/Space activation. Same
 * shape as `SegmentedControl` (options / value / onChange / label|labelledBy /
 * size / disabled) so the two are interchangeable at a call site once you have
 * picked the right recipe.
 */
export function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  size = "md",
  disabled = false,
  className,
}: FilterChipGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {options.map((option) => (
        <FilterChip
          key={option.value}
          active={option.value === value}
          disabled={disabled}
          size={size}
          // Announce "Staff, 3" rather than the algorithm's squashed "Staff· 3".
          // Only possible for a plain-string label; a node label keeps its own
          // computed name, exactly as it does today.
          aria-label={
            option.count !== undefined && typeof option.label === "string"
              ? `${option.label}, ${option.count}`
              : undefined
          }
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="tabular-nums"> · {option.count}</span>
          ) : null}
        </FilterChip>
      ))}
    </div>
  );
}

/**
 * A tri-state filter value as it travels in a query string: "" is ABSENT (the
 * server sees no parameter and returns everything), "true" and "false" are the
 * two halves.
 */
export type TriState = "" | "true" | "false";

/** Parse a URL-held tri-state back to the boolean the API client wants. */
export function triStateValue(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export type TriStateFilterProps = {
  /** Visible field label, e.g. "Original file". */
  label: string;
  value: TriState;
  onChange: (value: TriState) => void;
  /** Copy for the true/false chips. Defaults to Yes / No. */
  yesLabel?: string;
  noLabel?: string;
  disabled?: boolean;
};

/**
 * TriStateFilter — a labelled Any / Yes / No chip row for a filter whose ABSENCE
 * is a third meaning.
 *
 * The backend's `has_original`, `has_hls` and `has_web_files` are tri-state on
 * purpose: absent means "all", not "false". A checkbox has only two states, so
 * wiring one of these to a checkbox silently deletes the "show me the videos
 * with NO HLS" query — the one an operator hunting broken transcodes actually
 * needs. Three chips make all three states reachable and visible.
 */
export function TriStateFilter({
  label,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  disabled = false,
}: TriStateFilterProps) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-fg">
        {label}
      </span>
      <FilterChipGroup<TriState>
        labelledBy={labelId}
        size="sm"
        disabled={disabled}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: "Any" },
          { value: "true", label: yesLabel },
          { value: "false", label: noLabel },
        ]}
      />
    </div>
  );
}
