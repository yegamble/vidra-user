import { FULL_LIST_LIMIT } from "@/lib/api/pagination";

/** Runaway guard: 50 pages at the backend maximum (100) is 5,000 rows. */
export const DEFAULT_MAX_PAGES = 50;

/**
 * Walk a limit/offset list to its end and return every row. For an aggregate
 * that summarises ALL of a creator's videos (a picker, a roll-up) and so cannot
 * stop at the first page; a browsable list should use `useAppendingList`
 * instead. Pages are asked for at the backend maximum, and the loop stops at
 * `total`, at a short or empty page, or at `maxPages`. Hitting `maxPages` with
 * rows still to come calls `onTruncated` so the caller can say the list is
 * partial instead of silently showing a prefix. An aborted `signal` stops the
 * walk before the next page (it throws, like fetch does).
 */
export async function collectPages<T>(
  load: (window: { limit: number; offset: number }) => Promise<{ items: T[]; total?: number }>,
  {
    maxPages = DEFAULT_MAX_PAGES,
    signal,
    onTruncated,
  }: { maxPages?: number; signal?: AbortSignal; onTruncated?: () => void } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted();
    const res = await load({ limit: FULL_LIST_LIMIT, offset: all.length });
    all.push(...res.items);
    if (res.items.length === 0) return all;
    if (res.total !== undefined ? all.length >= res.total : res.items.length < FULL_LIST_LIMIT) return all;
  }
  onTruncated?.();
  return all;
}
