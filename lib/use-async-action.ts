"use client";

import { useState } from "react";

import { errorMessage } from "@/lib/api";

export type AsyncAction<A extends unknown[]> = {
  /** Run the action: busy while it is in flight, its failure message afterwards. */
  run: (...args: A) => Promise<void>;
  busy: boolean;
  error: string | null;
  /** Drop the message — bind to the input change that makes it stale. */
  clearError: () => void;
  /** Set a message without running anything, for the caller's own validation. */
  setError: (message: string | null) => void;
};

/**
 * useAsyncAction is the "click a button, wait, maybe show why it failed" state
 * that roughly thirty views were each spelling out by hand:
 *
 *     const [busy, setBusy] = useState(false);
 *     const [error, setError] = useState<string | null>(null);
 *     setBusy(true); setError(null);
 *     try { … } catch (err) { setError(errorMessage(err, "…")); } finally { setBusy(false); }
 *
 * Two things it fixes rather than just shortens. The `finally` is not optional
 * here: the hand-written copies that reset `busy` inside `catch` leave a control
 * stuck disabled forever if anything on the SUCCESS path throws — a rerender
 * during the post-success `onDone()`, say. And the message is derived one way,
 * so a backend that explains itself is quoted and one that does not falls back
 * to the caller's sentence, at every site.
 *
 * `fn` is the whole action INCLUDING its success side effects, so a throw from
 * either half is caught the same way. Validation that should not even start the
 * action stays with the caller, which reports it through `setError`.
 *
 * `mapError` handles the cases a generic message cannot: a 409 that means "you
 * already have one of those" rather than "conflict". Return a string to use it,
 * or null/undefined to fall through to `errorMessage(err, fallbackMessage)`.
 *
 * NOT for actions that must stay busy after they succeed (the control unmounts,
 * or navigation is about to replace the page and re-enabling it would invite a
 * double-fire). Those keep their hand-written state deliberately.
 */
export function useAsyncAction<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>,
  fallbackMessage: string,
  mapError?: (err: unknown) => string | null | undefined,
): AsyncAction<A> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    busy,
    error,
    setError,
    clearError: () => setError(null),
    run: async (...args: A) => {
      setBusy(true);
      setError(null);
      try {
        await fn(...args);
      } catch (err) {
        setError(mapError?.(err) ?? errorMessage(err, fallbackMessage));
      } finally {
        setBusy(false);
      }
    },
  };
}
