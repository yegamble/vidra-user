"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * The list state every paginated admin/search surface needs: a limit/offset
 * window, a sort key, and a bag of filter values. Held in the URL query string
 * rather than component state so a filtered, sorted, page-3 list is shareable,
 * bookmarkable and back-button-able — today every admin list keeps this in
 * `useState`, so a reload or a Back press silently snaps it to page one.
 */
export interface ListQueryState {
  limit: number;
  offset: number;
  sort: string;
  /** Only the keys declared in `filterKeys`, and only the non-empty ones. */
  filters: Record<string, string>;
}

export interface UseListQueryOptions {
  /**
   * Query-string prefix, so two lists on one route do not fight over `limit`
   * (`prefix: "users"` → `users_limit`, `users_offset`, …). Omit for the page's
   * primary list.
   */
  prefix?: string;
  /** Page size when the URL says nothing. Defaults to 20 (the app `PAGE_SIZE`). */
  defaultLimit?: number;
  /** Sort key when the URL says nothing. Defaults to "" (server's own default). */
  defaultSort?: string;
  /**
   * The filter params this list owns. Anything else in the query string is left
   * untouched (a list must not eat another widget's params), and an unknown key
   * passed to `setFilter` is ignored.
   */
  filterKeys?: readonly string[];
}

export interface ListQuery extends ListQueryState {
  /** Change the page size. Resets `offset` — page 3 of 100 is not page 3 of 20. */
  setLimit: (limit: number) => void;
  /** Move the window. The only setter that does NOT reset the offset. */
  setOffset: (offset: number) => void;
  /** Change the sort key. Resets `offset`. */
  setSort: (sort: string) => void;
  /** Set/clear one filter (empty string or undefined clears). Resets `offset`. */
  setFilter: (key: string, value: string | undefined) => void;
  /** Set/clear several filters in one navigation. Resets `offset`. */
  setFilters: (next: Record<string, string | undefined>) => void;
  /** Drop every param this list owns, back to the defaults. */
  reset: () => void;
  /** How many filters are applied — the count the Filters toggle shows. */
  activeFilterCount: number;
}

/** The backend accepts any list limit in [1,100]; anything else is a bug. */
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function clampLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(value)));
}

/**
 * useListQuery — owns `{limit, offset, sort, filters}` for one list and mirrors
 * it into the URL. Reads are derived straight from `useSearchParams()` (so the
 * URL is the single source of truth and Back/Forward just work); writes go
 * through `router.replace(..., { scroll: false })` so paging never pushes a
 * history entry per click and never yanks the viewport to the top.
 *
 * Values equal to their default are omitted from the URL, which keeps a plain
 * `/admin/users` clean until the operator actually narrows something.
 *
 * Callers must render inside a `<Suspense>` boundary (Next's requirement for
 * `useSearchParams` on a statically-rendered route).
 *
 * Note: each setter derives the next query string from the CURRENT one, so two
 * setter calls in the same tick would race. Change several filters at once with
 * `setFilters`, not with back-to-back `setFilter` calls.
 */
export function useListQuery(options: UseListQueryOptions = {}): ListQuery {
  const { prefix, defaultLimit = DEFAULT_LIMIT, defaultSort = "", filterKeys } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const keys = useMemo(() => filterKeys ?? [], [filterKeys]);
  const param = useCallback((key: string) => (prefix ? `${prefix}_${key}` : key), [prefix]);

  // `searchParams.get` returns null when absent, and `Number(null)` is 0 — which
  // would clamp to a one-row page. Fall back on absent/blank before parsing.
  const fallbackLimit = clampLimit(defaultLimit, DEFAULT_LIMIT);
  const rawLimit = searchParams.get(param("limit"));
  const limit = rawLimit ? clampLimit(Number(rawLimit), fallbackLimit) : fallbackLimit;
  const rawOffset = Number(searchParams.get(param("offset")));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
  const sort = searchParams.get(param("sort")) ?? defaultSort;

  const filterSignature = keys.map((key) => `${key}=${searchParams.get(param(key)) ?? ""}`).join("&");
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of keys) {
      const value = searchParams.get(param(key))?.trim();
      if (value) out[key] = value;
    }
    return out;
    // `filterSignature` is the value-level dependency; searchParams itself is a
    // new object on every render, so depending on it would rebuild every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature, keys, param]);

  /**
   * Apply a patch to the query string. `undefined`/"" removes a param; every
   * other param on the URL (another widget's, a tab id, …) is preserved.
   */
  const apply = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setOffset = useCallback(
    (nextOffset: number) => {
      const clamped = Number.isFinite(nextOffset) && nextOffset > 0 ? Math.trunc(nextOffset) : 0;
      apply({ [param("offset")]: clamped === 0 ? undefined : String(clamped) });
    },
    [apply, param],
  );

  const setLimit = useCallback(
    (nextLimit: number) => {
      const clamped = clampLimit(nextLimit, defaultLimit);
      apply({
        [param("limit")]: clamped === defaultLimit ? undefined : String(clamped),
        // A page size change invalidates the window: row 200 of a 100-per-page
        // list is not row 200 of a 5-per-page one.
        [param("offset")]: undefined,
      });
    },
    [apply, defaultLimit, param],
  );

  const setSort = useCallback(
    (nextSort: string) => {
      apply({
        [param("sort")]: nextSort === defaultSort ? undefined : nextSort,
        [param("offset")]: undefined,
      });
    },
    [apply, defaultSort, param],
  );

  const setFilters = useCallback(
    (next: Record<string, string | undefined>) => {
      const patch: Record<string, string | undefined> = { [param("offset")]: undefined };
      for (const [key, value] of Object.entries(next)) {
        if (!keys.includes(key)) continue;
        patch[param(key)] = value?.trim() || undefined;
      }
      apply(patch);
    },
    [apply, keys, param],
  );

  const setFilter = useCallback(
    (key: string, value: string | undefined) => setFilters({ [key]: value }),
    [setFilters],
  );

  const reset = useCallback(() => {
    const patch: Record<string, string | undefined> = {
      [param("limit")]: undefined,
      [param("offset")]: undefined,
      [param("sort")]: undefined,
    };
    for (const key of keys) patch[param(key)] = undefined;
    apply(patch);
  }, [apply, keys, param]);

  return {
    limit,
    offset,
    sort,
    filters,
    setLimit,
    setOffset,
    setSort,
    setFilter,
    setFilters,
    reset,
    activeFilterCount: Object.keys(filters).length,
  };
}
