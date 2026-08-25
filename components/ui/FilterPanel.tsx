"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ChevronDownIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const COLUMNS = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
} as const;

export type FilterPanelProps = {
  /** The filter fields. Composed by the call site; this shell never owns them. */
  children: ReactNode;
  /** How many filters are currently applied — the "N active" hint on the toggle. */
  activeCount?: number;
  /** Toggle text. Defaults to "Filters". */
  label?: string;
  /** Open state when the caller drives it (e.g. from the URL). Uncontrolled otherwise. */
  open?: boolean;
  /** Notified on every open/close, controlled or not. */
  onOpenChange?: (open: boolean) => void;
  /** Whether an uncontrolled panel starts open (e.g. arriving with filters applied). */
  defaultOpen?: boolean;
  /** Columns the revealed grid uses from `sm` up. One column on mobile always. */
  columns?: 1 | 2 | 3;
  /** Panel footer — typically a "Clear all" / "Apply" row. */
  footer?: ReactNode;
  className?: string;
};

/**
 * FilterPanel — the search-filter disclosure: a "Filters" toggle that reveals a
 * multi-column panel of fields, with the applied-filter count on the toggle
 * itself so a collapsed panel can never hide the fact that results are narrowed.
 * The same shell serves the admin console and the public search page.
 *
 * Presentational only — it owns nothing but its own disclosure state. Fields,
 * their values, and what "applied" means all belong to the caller.
 *
 * Accessibility:
 *  - the toggle is a real button carrying `aria-expanded` + `aria-controls`;
 *  - the panel stays mounted and is `hidden` when collapsed, so the
 *    `aria-controls` target always resolves and half-typed field values survive
 *    a collapse;
 *  - opening moves focus to the first field (the panel appeared *because* the
 *    user asked for it, so that is where they are going);
 *  - Escape anywhere inside collapses and returns focus to the toggle.
 *
 * Unlike `Dropdown` this does NOT close on outside click: it is an inline
 * disclosure that pushes the list down, not a popover floating over it, and
 * losing your filters because you clicked a result would be hostile.
 */
export function FilterPanel({
  children,
  activeCount = 0,
  label = "Filters",
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  columns = 2,
  footer,
  className,
}: FilterPanelProps) {
  const panelId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Skips the open-focus effect on first paint for a panel that starts open —
  // stealing focus on page load would be a bug, not a courtesy.
  const mounted = useRef(false);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus({ preventScroll: true });
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)} onKeyDown={onKeyDown}>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        // The visible text is just "Filters"; the count is a Badge beside it, so
        // spell the state into the accessible name too. It still starts with the
        // visible label, which keeps label-in-name (WCAG 2.5.3) satisfied.
        aria-label={activeCount > 0 ? `${label}, ${activeCount} active` : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          "focus-ring inline-flex w-fit items-center gap-1.5 rounded-full border bg-surface px-3.5 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted",
          activeCount > 0 ? "border-accent" : "border-border",
        )}
      >
        <SlidersIcon size={16} strokeWidth={2} className="shrink-0" />
        {label}
        {activeCount > 0 ? (
          <Badge variant="accent" className="tabular-nums">
            {activeCount}
          </Badge>
        ) : null}
        <ChevronDownIcon
          size={16}
          strokeWidth={2}
          className={cn("shrink-0 text-fg-muted transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        role="group"
        aria-label={label}
        // Same recipe as `ADMIN_PANEL`, spelled out rather than imported: a
        // `components/ui` primitive must not depend on `components/admin`, and
        // this panel also serves the public search page.
        className="rounded-2xl bg-surface-muted p-4"
      >
        <div className={cn("grid grid-cols-1 gap-3", COLUMNS[columns])}>{children}</div>
        {footer ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
