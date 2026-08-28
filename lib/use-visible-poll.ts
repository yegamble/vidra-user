"use client";

import { useEffect, useRef } from "react";

export interface UseVisiblePollOptions {
  /**
   * Whether to poll at all. False tears the timer down — the caller's "the live
   * stream is connected" or "there is nothing loaded yet" condition.
   */
  enabled: boolean;
  /** Milliseconds between ticks. */
  intervalMs: number;
  /**
   * Run one refresh. Held in a ref and re-read on every tick, so it does NOT
   * need to be memoised and never restarts the timer.
   */
  onPoll: () => void;
}

/**
 * useVisiblePoll — a background refresh that only fires while the tab is
 * actually being looked at, plus an immediate catch-up when it regains focus.
 *
 * The visibility test is the point: a backgrounded admin tab hammering an
 * aggregate nobody is reading is pure server load, and an operator returning to
 * a tab should not wait out the rest of an interval to see current numbers.
 * Both of the surfaces that poll (the job-run browser's REST fallback, the
 * playback-health dashboard) had written the same four-part effect —
 * `refreshIfVisible` + `setInterval` + a `focus` listener + the paired
 * teardown — where dropping any one part is a leak or a silent stall.
 */
export function useVisiblePoll({ enabled, intervalMs, onPoll }: UseVisiblePollOptions): void {
  // Kept current by an effect declared BEFORE the timer effect, so within one
  // commit the ref is refreshed first and every tick calls the newest closure.
  const onPollRef = useRef(onPoll);
  useEffect(() => {
    onPollRef.current = onPoll;
  });

  useEffect(() => {
    if (!enabled) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") onPollRef.current();
    };
    const timer = setInterval(refreshIfVisible, intervalMs);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [enabled, intervalMs]);
}
