"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PAGE_SIZE } from "@/components/ui/LoadMoreButton";

/**
 * One page of a browse list, normalised. Sibling of `ListPage` in
 * `lib/use-paged-list.ts`, and deliberately NOT the same thing: the admin lists
 * that hook serves REPLACE their rows as the limit/offset window moves, because
 * a table with a pager shows one page at a time. The public browse lists APPEND
 * — "Load more" adds to what is already on screen — so the two cannot share one
 * hook without one of them lying about what the reader is looking at.
 *
 * Everything else IS shared: the abortable fetch, the derived status, the load
 * callback held in a ref, and the honesty rules about the server's envelope.
 */
export interface AppendingPage<T> {
  items: T[];
  /**
   * How many rows match this query instance-wide, when the endpoint reports one.
   * Undefined means UNKNOWN — an older backend — never zero.
   */
  total?: number;
  /**
   * True when `total` is a floor rather than an exact count: the search service
   * stopped ranking at its recall cap, so more matches exist that were never
   * scored. Rendered as "N+", not as "N".
   */
  totalIsLowerBound?: boolean;
  /**
   * The server's own answer to "is there another page". Exact when present, and
   * the field to believe over any count arithmetic. Undefined means unknown.
   */
  hasMore?: boolean;
}

export type AppendingStatus = "loading" | "error" | "ready";
export type AppendingMoreStatus = "idle" | "loading" | "error";

/** The window one `load` call is being asked for. */
export interface AppendingWindow {
  limit: number;
  offset: number;
}

/**
 * Whether another page exists, decided from the best evidence the response
 * carried — in the order the contract prescribes:
 *
 *  1. the server's own `has_more`, which is exact whenever it is present;
 *  2. otherwise `offset + page length < total`, the arithmetic every PageMeta
 *     list supports;
 *  3. otherwise the short-page guess — a full page probably has a successor.
 *
 * Step 3 is the guess every list used to make unconditionally, and it is wrong
 * in both directions: an exactly-full last page leaves a "Load more" that
 * returns nothing, and a backend that clamps the limit hides a page that exists.
 * It survives only as the floor for a backend that reports neither field.
 */
export function resolveHasMore({
  serverHasMore,
  total,
  loaded,
  pageLength,
  pageSize,
}: {
  serverHasMore?: boolean;
  total?: number;
  /** Rows held after this page was appended. */
  loaded: number;
  /** Rows this page itself returned. */
  pageLength: number;
  pageSize: number;
}): boolean {
  if (serverHasMore !== undefined) return serverHasMore;
  if (total !== undefined) return loaded < total;
  return pageLength === pageSize;
}

export interface UseAppendingListOptions<T> {
  /**
   * The signature of the current request: query, filters, sort. A change resets
   * the list to its first page. Everything `load` reads must be part of it —
   * the same constraint that makes the state shareable as a URL.
   */
  queryKey: string;
  pageSize?: number;
  /**
   * A first page already fetched server-side. When present the list starts
   * `ready` on these rows and no browser request is made for page one — the
   * SSR-seeded home feed. It is read once, at mount.
   */
  initialPage?: AppendingPage<T> | null;
  /**
   * Fetch one window. Held in a ref and re-read on every fetch, so an inline
   * arrow is fine and it is deliberately not a dependency.
   */
  load: (window: AppendingWindow, signal: AbortSignal) => Promise<AppendingPage<T>>;
}

export interface AppendingList<T> {
  status: AppendingStatus;
  /** Every row loaded so far, first page through last. */
  items: T[];
  /** The server's count for this query, or null when it reports none. */
  total: number | null;
  /** Whether `total` is a floor rather than an exact count. */
  totalIsLowerBound: boolean;
  hasMore: boolean;
  moreStatus: AppendingMoreStatus;
  loadMore: () => void;
  /** Re-run the current query from page one (the Retry verb). */
  reload: () => void;
  /** Drop the rows failing `keep` AND take them off the total (a real delete). */
  drop: (keep: (item: T) => boolean) => void;
}

interface Loaded<T> {
  key: string;
  attempt: number;
  items: T[];
  total?: number;
  totalIsLowerBound: boolean;
  hasMore: boolean;
}

/** One shared empty array, so `items` keeps its identity across empty renders. */
const NO_ITEMS: unknown[] = [];

/**
 * useAppendingList — the one "Load more" list hook for vidra's public browse
 * surfaces: the search results (videos, channels, accounts) and the home /
 * trending feed. It owns what those four had each re-implemented: the first
 * fetch, the appended pages, the loading/error status, and the honest
 * `hasMore`. What goes after the last row — the auto-load sentinel and the
 * manual button — is `components/ui/ListTail`.
 *
 * Status is DERIVED, not stored — a page counts as loaded only if it was loaded
 * for the query that is current right now. So changing a filter shows the
 * skeleton on the same render the props change, and a stale list can never
 * flash under new filters while its refetch is in flight. That is what lets the
 * callers stop remounting themselves on a filter key.
 */
export function useAppendingList<T>(options: UseAppendingListOptions<T>): AppendingList<T> {
  const { queryKey, pageSize = PAGE_SIZE, initialPage, load } = options;

  // The SSR seed belongs to the key that was current at mount and to attempt 0.
  // Pinning the key here (rather than reacting to the prop) is what keeps a
  // later re-render carrying the same seed from resurrecting page one under
  // rows already appended past it.
  const seededKey = useRef(initialPage ? queryKey : null);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [attempt, setAttempt] = useState(0);
  // Read once, as the initial state — `initialPage` is a mount-time seed, and
  // reacting to later values of it is exactly what `seededKey` prevents.
  const [loaded, setLoaded] = useState<Loaded<T> | null>(() =>
    initialPage
      ? {
          key: queryKey,
          attempt: 0,
          items: initialPage.items,
          total: initialPage.total,
          totalIsLowerBound: initialPage.totalIsLowerBound === true,
          hasMore: resolveHasMore({
            serverHasMore: initialPage.hasMore,
            total: initialPage.total,
            loaded: initialPage.items.length,
            pageLength: initialPage.items.length,
            pageSize,
          }),
        }
      : null,
  );
  const [failed, setFailed] = useState<{ key: string; attempt: number } | null>(null);
  const [moreStatus, setMoreStatus] = useState<AppendingMoreStatus>("idle");

  useEffect(() => {
    // The seeded first page is already on screen; only an explicit reload
    // (attempt > 0) re-fetches it.
    if (seededKey.current === queryKey && attempt === 0) return;
    // Any other query retires the seed for good. Without this, navigating away
    // and back would match the seed's key again while `loaded` had long since
    // been overwritten — and the effect would skip a fetch the list needs,
    // leaving it in `loading` forever.
    seededKey.current = null;
    const controller = new AbortController();
    // `Promise.resolve().then` rather than a bare call so a `load` that decides
    // the request is unsendable can just THROW into the same error state as a
    // rejected fetch, instead of escaping the effect and crashing the tree.
    Promise.resolve()
      .then(() => loadRef.current({ limit: pageSize, offset: 0 }, controller.signal))
      .then((page) => {
        if (controller.signal.aborted) return;
        setLoaded({
          key: queryKey,
          attempt,
          items: page.items,
          total: page.total,
          totalIsLowerBound: page.totalIsLowerBound === true,
          hasMore: resolveHasMore({
            serverHasMore: page.hasMore,
            total: page.total,
            loaded: page.items.length,
            pageLength: page.items.length,
            pageSize,
          }),
        });
        setMoreStatus("idle");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setFailed({ key: queryKey, attempt });
      });
    return () => controller.abort();
  }, [queryKey, attempt, pageSize]);

  const current = loaded?.key === queryKey && loaded.attempt === attempt ? loaded : null;
  const errored = failed?.key === queryKey && failed.attempt === attempt;
  const status: AppendingStatus = current ? "ready" : errored ? "error" : "loading";

  const loadMore = useCallback(() => {
    // Nothing to extend: the first page has not settled, so there is no window
    // to advance past. The button and the sentinel are both absent in that
    // state; this only guards a caller calling it directly.
    if (!current) return;
    setMoreStatus("loading");
    const offset = current.items.length;
    // No abort on unmount, deliberately: a page that lands late is dropped by
    // the key/attempt check below, and cancelling would also cancel the page a
    // reader on a slow connection is waiting for whenever React re-runs.
    const controller = new AbortController();
    Promise.resolve()
      .then(() => loadRef.current({ limit: pageSize, offset }, controller.signal))
      .then((page) => {
        setLoaded((prev) => {
          // A page that landed after the query moved on belongs to a list nobody
          // is looking at any more; dropping it is what stops results for the
          // previous search appending under the new one.
          if (!prev || prev.key !== queryKey || prev.attempt !== attempt) return prev;
          const items = [...prev.items, ...page.items];
          return {
            ...prev,
            items,
            total: page.total ?? prev.total,
            totalIsLowerBound: page.totalIsLowerBound ?? prev.totalIsLowerBound,
            hasMore: resolveHasMore({
              serverHasMore: page.hasMore,
              total: page.total ?? prev.total,
              loaded: items.length,
              pageLength: page.items.length,
              pageSize,
            }),
          };
        });
        setMoreStatus("idle");
      })
      .catch(() => setMoreStatus("error"));
  }, [attempt, current, pageSize, queryKey]);

  const reload = useCallback(() => {
    setMoreStatus("idle");
    setAttempt((n) => n + 1);
  }, []);

  const drop = useCallback((keep: (item: T) => boolean) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter(keep);
      const removed = prev.items.length - items.length;
      return {
        ...prev,
        items,
        total: prev.total === undefined ? undefined : Math.max(0, prev.total - removed),
      };
    });
  }, []);

  return {
    status,
    items: current?.items ?? (NO_ITEMS as T[]),
    total: current?.total ?? null,
    totalIsLowerBound: current?.totalIsLowerBound === true,
    // Only a settled list has a next page: `hasMore` stays false while the
    // first page is in flight, which is what keeps a sentinel from asking for
    // page two of a list that has no page one yet.
    hasMore: current?.hasMore === true,
    moreStatus,
    loadMore,
    reload,
    drop,
  };
}
