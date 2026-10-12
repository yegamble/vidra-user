import { FULL_LIST_LIMIT } from "@/lib/api/pagination";

/**
 * Walk a limit/offset list to its end and return every row. For an aggregate
 * that summarises ALL of a creator's videos (a picker, a roll-up) and so cannot
 * stop at the first page; a browsable list should use `useAppendingList`
 * instead. Pages are asked for at the backend maximum, and the loop stops at
 * `total`, at a short or empty page, or at `maxPages` (a runaway guard).
 */
export async function collectPages<T>(
  load: (window: { limit: number; offset: number }) => Promise<{ items: T[]; total?: number }>,
  { maxPages = 50 }: { maxPages?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await load({ limit: FULL_LIST_LIMIT, offset: all.length });
    all.push(...res.items);
    if (res.items.length === 0) break;
    if (res.total !== undefined ? all.length >= res.total : res.items.length < FULL_LIST_LIMIT) break;
  }
  return all;
}
