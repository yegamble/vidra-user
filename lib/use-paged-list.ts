"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useListQuery, type ListQuery, type ListQueryState, type UseListQueryOptions } from "@/lib/use-list-query";

/**
 * One page of a list endpoint, normalised. Every vidra list response carries the
 * same `PageMeta` (total/limit/offset) composed in via `allOf`; only the name of
 * the array differs (`videos`, `reports`, `entries`, …), so the caller's `load`
 * renames it and everything else here is shared.
 *
 * `total`, `limit` and `offset` are the SERVER's numbers, not the ones we asked
 * for: the backend clamps `limit`, so believing our own request would mis-size
 * every page label and every Next step.
 */
export interface ListPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type ListStatus = "loading" | "error" | "ready";

/**
 * One shared empty array for every "no rows yet" render. A fresh `[]` each time
 * would give `items` a new identity on every render, which breaks any caller
 * that treats it as a memo/effect dependency (and would spin a render-time
 * reconciliation forever).
 */
const NO_ITEMS: unknown[] = [];

export interface UsePagedListOptions<T> extends UseListQueryOptions {
  /**
   * Fetch one page. Receives the current `{limit, offset, sort, filters}` and an
   * abort signal; returns the normalised page.
   *
   * It is held in a ref and re-read on every fetch, so it does NOT need to be
   * memoised and is deliberately not a dependency. The corollary: every input
   * that should trigger a refetch must be part of the list query (a filter, the
   * sort, the window) rather than captured from surrounding component state.
   * That is the same constraint that makes the state shareable as a URL.
   */
  load: (query: ListQueryState, signal: AbortSignal) => Promise<ListPage<T>>;
}

export interface PagedList<T> extends ListQuery {
  status: ListStatus;
  /** The rows of the current page. Empty while loading, on error, and for an empty page. */
  items: T[];
  /** How many rows match the current filters instance-wide — the header count. */
  total: number;
  /** The server's echo of the applied page size / window. */
  pageLimit: number;
  pageOffset: number;
  /** Re-run the current request (the Retry / Refresh verb). */
  reload: () => void;
  /**
   * Rewrite the loaded rows in place — an optimistic edit whose row is still
   * there afterwards (a block flag flipping, a request changing status). The
   * total is untouched because the row still counts.
   */
  patch: (update: (items: T[]) => T[]) => void;
  /**
   * Drop the rows that fail `keep` AND take them off the total — for a row that
   * really stopped existing (a delete, an unblock leaving the block-list). Using
   * `patch` for this would leave the pager claiming a row that is gone.
   */
  drop: (keep: (item: T) => boolean) => void;
  /**
   * Put a freshly created row at the head of the page and add it to the total
   * (the add-a-watched-word / block-an-instance forms).
   */
  prepend: (item: T) => void;
}

/**
 * usePagedList — the one list-fetching hook for vidra's admin/moderation
 * surfaces. It owns the four things fourteen views each re-implemented: the
 * limit/offset window (in the URL, via `useListQuery`), the abortable fetch, the
 * loading/error/ready status, and the server's page envelope.
 *
 * The envelope is the point. Every one of those views rendered `items.length` as
 * its header count while asking for a fixed `limit: 100` and never sending an
 * offset, so an instance with 4,649 videos reported "100 videos" and had no
 * second page. Keeping the whole response — not just its rows — is what makes
 * `total` available to the header and to `AdminPagination`.
 *
 * Status is DERIVED, not stored: a page is "ready" only if it was loaded for the
 * query that is current right now. So changing a filter shows the spinner on the
 * same render that changes the URL, and a stale list can never flash under new
 * filters while its refetch is in flight.
 *
 * Callers must render inside a `<Suspense>` boundary — `useListQuery` reads
 * `useSearchParams()`. `ListBoundary` is that boundary.
 */
export function usePagedList<T>(options: UsePagedListOptions<T>): PagedList<T> {
  const { load, ...queryOptions } = options;
  const query = useListQuery(queryOptions);
  const { limit, offset, sort, filters } = query;

  // Referentially stable while the values are: `filters` is already memoised by
  // `useListQuery` on its own value signature, so this object only changes when
  // the list state genuinely changes — which is exactly when to refetch.
  const state = useMemo<ListQueryState>(
    () => ({ limit, offset, sort, filters }),
    [limit, offset, sort, filters],
  );

  // Kept current by an effect declared BEFORE the fetch effect, so within one
  // commit the ref is refreshed first and the fetch below always calls the
  // newest closure. (Writing it during render is what React's rules forbid.)
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ state: ListQueryState; attempt: number; page: ListPage<T> } | null>(null);
  const [failed, setFailed] = useState<{ state: ListQueryState; attempt: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // `Promise.resolve().then` rather than a bare call so a `load` that decides
    // the request is unsendable can just THROW — a client-side validation
    // failure lands in the same error state as a rejected fetch instead of
    // escaping the effect and crashing the tree.
    Promise.resolve()
      .then(() => loadRef.current(state, controller.signal))
      .then((page) => {
        if (controller.signal.aborted) return;
        setLoaded({ state, attempt, page });
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setFailed({ state, attempt });
      });
    return () => controller.abort();
  }, [state, attempt]);

  const current = loaded?.state === state && loaded.attempt === attempt ? loaded.page : null;
  const errored = failed?.state === state && failed.attempt === attempt;
  const status: ListStatus = current ? "ready" : errored ? "error" : "loading";

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const patch = useCallback((update: (items: T[]) => T[]) => {
    setLoaded((prev) => (prev ? { ...prev, page: { ...prev.page, items: update(prev.page.items) } } : prev));
  }, []);

  const drop = useCallback((keep: (item: T) => boolean) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const items = prev.page.items.filter(keep);
      const removed = prev.page.items.length - items.length;
      return {
        ...prev,
        page: { ...prev.page, items, total: Math.max(0, prev.page.total - removed) },
      };
    });
  }, []);

  const prepend = useCallback((item: T) => {
    setLoaded((prev) =>
      prev
        ? {
            ...prev,
            page: { ...prev.page, items: [item, ...prev.page.items], total: prev.page.total + 1 },
          }
        : prev,
    );
  }, []);

  return {
    ...query,
    status,
    items: current?.items ?? (NO_ITEMS as T[]),
    total: current?.total ?? 0,
    // Fall back on what we asked for so the pager is sized sanely on the first
    // paint and on an error, before any server echo exists.
    pageLimit: current?.limit ?? limit,
    pageOffset: current?.offset ?? offset,
    reload,
    patch,
    drop,
    prepend,
  };
}
