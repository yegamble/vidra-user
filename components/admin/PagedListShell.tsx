"use client";

import type { ReactNode } from "react";

import { AdminPagination } from "@/components/admin/AdminControls";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { pluralize } from "@/lib/format";
import type { PagedList } from "@/lib/use-paged-list";

export type PagedListShellProps<T> = {
  /** The list this shell is rendering. Supplies status, rows, total and window. */
  list: PagedList<T>;
  /**
   * What one row IS ("comment", "blocked video"). Names the count line, the
   * pager, and the loading spinner, so those three can never disagree.
   */
  noun: string;
  /** Controls above the list — a search field, a filter row, an add form. */
  toolbar?: ReactNode;
  /** Extra content on the count line, aligned to the end (e.g. a Refresh). */
  headerAside?: ReactNode;
  /** Drop the count line entirely, for a surface whose heading already says it. */
  hideCount?: boolean;
  errorMessage: string;
  emptyIcon?: ReactNode;
  emptyTitle: string;
  emptyMessage?: string;
  /** The rendered rows. Only mounted when there is at least one. */
  children: ReactNode;
};

/**
 * PagedListShell — the chrome every non-tabular admin list repeats: a count
 * line, a toolbar slot, the loading / error / empty triad, and the pager.
 *
 * `AdminTable` already owns this for the tabular surfaces; this is the same
 * contract for the ones that render cards or a `<ul>`, so the two families stay
 * consistent instead of drifting into two vocabularies. Between them, no admin
 * view spells "nothing here" or "could not load" for itself again.
 *
 * Two details that are easy to get wrong and are therefore decided here:
 *
 *  - the COUNT comes from `list.total`, the server's answer for the current
 *    filters, never from the rows on screen. Every one of these views used to
 *    render its page length, which is how "All videos" reported 100 on an
 *    instance with thousands;
 *  - the PAGER survives the empty state. Deleting the last row on the last page
 *    lands you on an empty page, and hiding the pager there would strand you
 *    with no way back.
 */
export function PagedListShell<T>({
  list,
  noun,
  toolbar,
  headerAside,
  hideCount = false,
  errorMessage,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  children,
}: PagedListShellProps<T>) {
  const plural = pluralize(2, noun);
  return (
    <div className="flex flex-col gap-4">
      {hideCount && !headerAside ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hideCount ? (
            <span />
          ) : (
            <p className="text-sm font-semibold tabular-nums text-fg-muted">
              {list.status === "ready"
                ? `${list.total} ${pluralize(list.total, noun)}`
                : plural.charAt(0).toUpperCase() + plural.slice(1)}
            </p>
          )}
          {headerAside}
        </div>
      )}

      {toolbar}

      {list.status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label={`Loading ${plural}`} />
        </div>
      ) : list.status === "error" ? (
        <ErrorState message={errorMessage} onRetry={list.reload} />
      ) : (
        <>
          {list.items.length === 0 ? (
            <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
          ) : (
            children
          )}
          <AdminPagination
            total={list.total}
            limit={list.pageLimit}
            offset={list.pageOffset}
            onOffset={list.setOffset}
            onPageSize={list.setLimit}
            label={plural}
          />
        </>
      )}
    </div>
  );
}
