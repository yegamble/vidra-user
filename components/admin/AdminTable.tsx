"use client";

import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

/** One declared column. `Row` is the caller's row type — nothing is assumed of it. */
export type AdminTableColumn<Row> = {
  /** Stable key: the React key for the header and every cell in the column. */
  key: string;
  /** Header text. Pair with `srOnlyHeader` for an actions/kebab column. */
  header: ReactNode;
  /** Cell renderer. Gets the row and its index within the current page. */
  cell: (row: Row, index: number) => ReactNode;
  /** Right-align the column (counts, timings, trailing actions). */
  align?: "start" | "end";
  /** Keep the header for screen readers but hide it visually. */
  srOnlyHeader?: boolean;
  /** Extra classes for this column's cells (`tabular-nums`, `whitespace-nowrap`, …). */
  cellClassName?: string;
  /** Extra classes for this column's header cell. */
  headerClassName?: string;
};

/** Row padding. `compact` matches the job-runs/QoE tables, `comfortable` the videos table. */
export type AdminTableDensity = "compact" | "comfortable";

const DENSITY: Record<AdminTableDensity, string> = {
  compact: "px-3 py-2.5",
  comfortable: "px-4 py-3",
};

export type AdminTableStatus = "idle" | "loading" | "error";

export type AdminTableProps<Row> = {
  /** Accessible table name ("Job executions"). Also names the loading spinner. */
  label: string;
  columns: readonly AdminTableColumn<Row>[];
  rows: readonly Row[];
  /** Stable React key per row (an id, or a composite for federated rows). */
  rowKey: (row: Row, index: number) => string;
  /** Fetch state. `idle` renders the table (or the empty state). */
  status?: AdminTableStatus;
  /** Error copy for `status: "error"`. */
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  /** What to show for zero rows. Defaults to a plain `EmptyState`. */
  empty?: ReactNode;
  /**
   * Minimum table width before the wrapper scrolls horizontally, e.g. "72rem".
   * An inline style, not a Tailwind class: an arbitrary value assembled at
   * runtime is invisible to the compiler and would emit no CSS.
   */
  minWidth?: string;
  density?: AdminTableDensity;
  /** Extra classes on a row's `<tr>` — e.g. a deactivated-row de-emphasis. */
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** Footer slot, normally an `<AdminPagination>`. Rendered below the scroller. */
  footer?: ReactNode;
  className?: string;
};

/**
 * AdminTable — the admin console's one table shell. Every admin list used to
 * hand-write the same `overflow-x-auto rounded-2xl border` wrapper, the same
 * `min-w-[Nrem] text-left text-sm` table, and the same 90-character `<thead>`
 * class string; four copies had already drifted apart. Columns are declared as
 * data here, so a page says what its columns ARE and never restates the chrome.
 *
 * Purely presentational: it fetches nothing and holds no state. Loading, error
 * and empty go through the app's existing `Spinner` / `ErrorState` /
 * `EmptyState` primitives so an admin table cannot invent a fifth spelling of
 * "nothing here".
 *
 * The footer renders for the empty page too (not just for pages with rows), so
 * an operator who overshoots the last page still has a Previous button to get
 * back with.
 */
export function AdminTable<Row>({
  label,
  columns,
  rows,
  rowKey,
  status = "idle",
  errorTitle,
  errorMessage,
  onRetry,
  empty,
  minWidth,
  density = "comfortable",
  rowClassName,
  footer,
  className,
}: AdminTableProps<Row>) {
  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label={`Loading ${label}`} />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState title={errorTitle} message={errorMessage} onRetry={onRetry} />;
  }

  const pad = DENSITY[density];
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {rows.length === 0 ? (
        empty ?? <EmptyState title={`No ${label.toLowerCase()}`} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
          <table
            aria-label={label}
            style={minWidth ? { minWidth } : undefined}
            className="w-full text-left text-sm"
          >
            <thead className="border-b border-border-subtle text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      pad,
                      column.align === "end" && "text-right",
                      column.headerClassName,
                    )}
                  >
                    {column.srOnlyHeader ? (
                      <span className="sr-only">{column.header}</span>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((row, index) => (
                <tr key={rowKey(row, index)} className={rowClassName?.(row, index)}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        pad,
                        column.align === "end" && "text-right",
                        column.cellClassName,
                      )}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </div>
  );
}
