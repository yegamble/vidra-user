"use client";

import { useId, type ReactNode } from "react";

import { ADMIN_PANEL } from "@/components/admin/AdminControls";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";

/** One choice in the toolbar's sort picker. */
export type SortOption = { value: string; label: string };

export type ListToolbarProps = {
  /** The search control — normally an `<AdminSearch>`; any node is accepted. */
  search?: ReactNode;
  /** Sort picker. Omit for a list the backend does not let you reorder. */
  sort?: {
    value: string;
    onChange: (value: string) => void;
    options: readonly SortOption[];
    /** Visible label beside the picker. Defaults to "Sort". */
    label?: string;
  };
  /**
   * The filter affordance — normally a `<FilterPanel>` toggle+panel. Rendered
   * after the sort picker; its own disclosure state is its business, not ours.
   */
  filters?: ReactNode;
  /**
   * Applied-filter count. Rendered as an accent badge with an explicit label,
   * for surfaces whose filters live somewhere other than a `FilterPanel` (which
   * carries its own count on the toggle). Zero renders nothing.
   */
  activeFilterCount?: number;
  /** Trailing actions (Refresh, Export, …), pushed to the end of the row. */
  actions?: ReactNode;
  /**
   * Wrap the row in the `ADMIN_PANEL` surface. Off by default: `AdminSearch`
   * paints its own field `surface-muted`, which vanishes on a `surface-muted`
   * panel — so opt in only for a toolbar whose search is a plain `Input` (or
   * which has none).
   */
  panel?: boolean;
  className?: string;
};

/**
 * ListToolbar — the control row above an admin list: search on the left, sort /
 * filters / actions on the right. Deliberately dumb: it fetches nothing, owns
 * no list state, and holds no state of its own. It exists so fourteen admin
 * surfaces stop each inventing their own flex row, and so the search field, the
 * sort picker and the filter disclosure always sit in the same order.
 */
export function ListToolbar({
  search,
  sort,
  filters,
  activeFilterCount = 0,
  actions,
  panel = false,
  className,
}: ListToolbarProps) {
  const sortLabelId = useId();
  const sortLabel = sort?.label ?? "Sort";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        panel && ADMIN_PANEL,
        className,
      )}
    >
      {search ? <div className="min-w-0 flex-1">{search}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        {sort ? (
          <div className="flex items-center gap-2">
            <span id={sortLabelId} className="text-xs text-fg-muted">
              {sortLabel}
            </span>
            {/* Width lives on a wrapper, never as a competing utility on the
                Select: `cn()` is a plain concat with no tailwind-merge. */}
            <div className="w-44">
              <Select
                aria-labelledby={sortLabelId}
                value={sort.value}
                onChange={(e) => sort.onChange(e.target.value)}
              >
                {sort.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : null}
        {filters}
        {activeFilterCount > 0 ? (
          <Badge variant="accent" className="tabular-nums">
            {activeFilterCount} active
          </Badge>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
