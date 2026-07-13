"use client";

import { useEffect, useState } from "react";

/**
 * useDebouncedValue returns a copy of `value` that only updates after it has
 * stopped changing for `delayMs`. The autocomplete uses it to hold back
 * suggestion fetches until the user pauses typing (default 200ms), so a fast
 * typist fires one request, not one per keystroke.
 *
 * The timer is cleared on every change and on unmount, so a value that keeps
 * changing never resolves and a torn-down component never updates state. It is
 * fake-timer friendly: with vitest's `vi.useFakeTimers()` a test types, then
 * `vi.advanceTimersByTime(delayMs)` to observe the debounced value flip.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
