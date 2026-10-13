"use client";

import { useEffect, useState } from "react";

/**
 * useNow returns the current time and re-renders every `everyMs` while `active`.
 * The countdown on an upcoming live is the only caller: a coarse tick (the line
 * reads in minutes), paused when the tab is hidden by the browser's own timer
 * throttling and not run at all when there is nothing to count down to.
 */
export function useNow(active: boolean, everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return now;
}
