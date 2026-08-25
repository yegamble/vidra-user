"use client";

import { useEffect, useRef, type RefObject } from "react";

export interface UseAutoLoadOptions {
  /**
   * Master switch. When false the hook does nothing at all — no observer is
   * ever constructed — so a surface can opt out (reduced-motion/data users, a
   * list whose pager is explicit, a test) with zero cost.
   */
  enabled?: boolean;
  /** Whether another page exists. Once false the observer stops for good. */
  hasMore: boolean;
  /** Whether a page is already in flight. Re-entry while busy is suppressed. */
  busy: boolean;
  /** Fetch the next page. Held in a ref, so an inline arrow is fine. */
  onLoadMore: () => void;
  /**
   * How far below the viewport the sentinel counts as visible. Default 400px so
   * the next page is usually in hand before the reader reaches the seam.
   */
  rootMargin?: string;
}

/**
 * useAutoLoad — infinite scroll for the "Load more" lists: attach the returned
 * ref to a sentinel element after the last row and the next page fetches as the
 * sentinel scrolls into view.
 *
 * **The manual `LoadMoreButton` must stay reachable.** A scroll sentinel is not
 * keyboard-operable: a Tab-only or screen-reader user never scrolls it into
 * view, so auto-load alone would strand them at page one. Callers therefore
 * keep rendering the button — use `shouldRenderLoadMore` — whenever auto-load is
 * off OR the last attempt errored (an errored sentinel would otherwise retry
 * itself into a loop, and there would be nothing left to click). Auto-load is a
 * convenience layered over the button, never a replacement for it.
 *
 * Safety properties, all exercised by the unit tests:
 *  - `enabled: false` constructs no observer;
 *  - a missing `IntersectionObserver` (jsdom, SSR) degrades to a no-op, the same
 *    guard `HomeRecommendationsRail` uses for its impression observer;
 *  - no re-entry while `busy`, and no observation once `hasMore` is false;
 *  - the observer is disconnected on cleanup and on every dependency change.
 */
export function useAutoLoad({
  enabled = true,
  hasMore,
  busy,
  onLoadMore,
  rootMargin = "400px",
}: UseAutoLoadOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The callback lives in a ref so a caller's inline closure does not tear down
  // and rebuild the observer on every render. Written in an effect, never during
  // render (`react-hooks/refs`); effects flush long before any scroll can fire
  // the observer, so the ref is always the current callback by then.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    // Every one of these is a reason not to observe: disabled, nothing left to
    // fetch, a page already in flight, no sentinel mounted, or no platform
    // support. Re-running the effect when `busy` clears is what continues a
    // still-visible sentinel to the next page.
    if (!enabled || !hasMore || busy) return;
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // Stop observing before handing off: the caller flips `busy` in a state
        // update, which is a tick away, and a fast scroll could otherwise fire
        // twice inside that window.
        observer.disconnect();
        onLoadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, busy, rootMargin]);

  return sentinelRef;
}

/**
 * shouldRenderLoadMore — the manual-button contract in one place, so no surface
 * has to remember it. The button shows while there IS another page and either
 * auto-load is off (keyboard users' only route to it) or the last auto-load
 * failed (the sentinel has given up; the click is the retry).
 */
export function shouldRenderLoadMore({
  hasMore,
  autoLoad,
  error,
}: {
  hasMore: boolean;
  /** Whether auto-load is active for this list. */
  autoLoad: boolean;
  /** The last page error, if any. */
  error?: string | null;
}): boolean {
  if (!hasMore) return false;
  return !autoLoad || Boolean(error);
}
