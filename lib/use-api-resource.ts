"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * The three states a client-side fetch can be in. The same triple as
 * `usePagedList`'s `ListStatus` and `useAppendingList`'s `AppendingStatus` —
 * this is the one for a resource with no pager at all.
 */
export type ResourceStatus = "loading" | "error" | "ready";

export interface ApiResource<T> {
  status: ResourceStatus;
  /** The loaded value. `null` until the first successful load, and while reloading after a dep change. */
  data: T | null;
  /** Re-run the request — the Retry button's verb. */
  retry: () => void;
  /**
   * Rewrite the loaded value in place, for an optimistic edit whose result the
   * caller already knows (a row unblocked, a preference toggled). Does not
   * refetch: use `retry` for that. A no-op before the first load lands.
   */
  setData: Dispatch<SetStateAction<T | null>>;
}

/** Element-wise `Object.is`, i.e. React's own dependency comparison. */
function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, i) => Object.is(value, b[i]));
}

/**
 * useApiResource — one abortable client-side fetch with a loading/error/ready
 * status and a retry.
 *
 * Forty-odd views each wrote this out: a `type Status` triple, a `reloadKey`
 * counter, an `AbortController` effect, and a `.catch` that must remember to
 * check `signal.aborted` before flipping to the error state. The check is the
 * part worth centralising — an unmount or a dep change aborts the request, the
 * rejection still arrives, and a copy that forgot the guard paints "Could not
 * load" over a surface the reader already navigated away from.
 *
 * This is the hook for a resource a view loads WHOLE: the settings payloads,
 * the block/mute lists, a job overview. Paginated admin lists want
 * `usePagedList` (limit/offset in the URL, plus the server's page envelope);
 * browse lists that append want `useAppendingList`.
 *
 * Status is DERIVED, not stored: a value is "ready" only if it was loaded for
 * the deps that are current right now. So a dep change shows the spinner on the
 * same render that changes the deps, and a stale value can never flash as
 * "ready" while its replacement is in flight.
 *
 * `load` is held in a ref and re-read on every fetch, so it does NOT need to be
 * memoised. The corollary: anything it reads that should trigger a refetch must
 * be listed in `deps`, exactly as for a bare `useEffect`.
 */
export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
): ApiResource<T> {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    deps: readonly unknown[];
    attempt: number;
    data: T;
  } | null>(null);
  const [failed, setFailed] = useState<{ deps: readonly unknown[]; attempt: number } | null>(null);

  // Kept current by an effect declared BEFORE the fetch effect, so within one
  // commit the ref is refreshed first and the fetch below always calls the
  // newest closure. (Writing it during render is what React's rules forbid.)
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    // The deps this fetch is running for, taken from the effect's own closure —
    // the effect re-runs exactly when they change, so this is correct by
    // construction and needs no ref. The resolved value is stamped with them so
    // render can tell a fresh result from a stale one. `deps` is an inline
    // literal at most call sites (a fresh array every render), which is why the
    // match below is element-wise rather than by array identity.
    const forDeps = deps;
    // `Promise.resolve().then` rather than a bare call so a `load` that decides
    // the request is unsendable can just THROW — a client-side validation
    // failure lands in the same error state as a rejected fetch instead of
    // escaping the effect and crashing the tree.
    Promise.resolve()
      .then(() => loadRef.current(controller.signal))
      .then((data) => {
        if (controller.signal.aborted) return;
        setLoaded({ deps: forDeps, attempt, data });
      })
      .catch((err: unknown) => {
        void err;
        // The abort guard: an aborted request's rejection is expected, not a
        // failure to report.
        if (controller.signal.aborted) return;
        setFailed({ deps: forDeps, attempt });
      });
    return () => controller.abort();
    // `deps` is the caller's own dependency list, spread in alongside the retry
    // counter; the linter cannot see through the spread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const current =
    loaded && loaded.attempt === attempt && sameDeps(loaded.deps, deps) ? loaded : null;
  const errored = failed !== null && failed.attempt === attempt && sameDeps(failed.deps, deps);
  const status: ResourceStatus = current ? "ready" : errored ? "error" : "loading";

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const setData = useCallback<Dispatch<SetStateAction<T | null>>>((update) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const next =
        typeof update === "function" ? (update as (p: T | null) => T | null)(prev.data) : update;
      return next === null ? null : { ...prev, data: next };
    });
  }, []);

  return { status, data: current?.data ?? null, retry, setData };
}
