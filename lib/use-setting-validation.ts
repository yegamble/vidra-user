"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import type { SettingValue } from "@/lib/admin-config-ia";

/**
 * How long after the operator leaves a field before we ask the server about it.
 * Long enough that tabbing straight through a section does not fire a burst of
 * requests, short enough that the answer is there before they reach for Save.
 */
export const VALIDATE_DEBOUNCE_MS = 400;

export type SettingValidation = {
  /** Per-key messages from the most recent dry run. Same shape as 422 fields. */
  errors: Record<string, string>;
  /** Ask the server about one key (debounced). Call when the field loses focus. */
  validateKey: (key: string, value: SettingValue) => void;
  /** Drop a key's message without asking — used when its override is reset. */
  clearKey: (key: string) => void;
  /** Drop everything — used when the form reseeds from fresh server truth. */
  reset: () => void;
};

/**
 * useSettingValidation asks the SERVER whether a value is acceptable, instead of
 * keeping a second copy of its rules in the browser.
 *
 * The admin config form used to carry hand-written mirrors of the backend's
 * validators (hex colors, handle syntax, integer ranges, the HLS rung set). A
 * copy like that is wrong the first time either side changes, and the operator
 * finds out as a surprise 422 on save — after they have already written the
 * value and moved on. POST /admin/instance-settings/validate answers the same
 * question the PATCH would, without writing anything, so there is exactly one
 * set of rules and the browser just reports what it is told.
 *
 * The PATCH's 422 remains the authoritative backstop; this is only the early
 * answer. That layering is deliberate: a dry run that has not come back yet (or
 * that failed on the network) must never block a save, because the write itself
 * re-validates anyway. So a failed probe is silently dropped — inventing an
 * error message here would block a save the server would have accepted.
 *
 * One request in flight per key. A newer edit aborts the older probe and stale
 * responses are discarded by sequence number, so the last thing the operator
 * typed is always the thing the displayed message is about.
 */
export function useSettingValidation(): SettingValidation {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Per-key pending timer and in-flight request, so keys never cancel each other.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Map<string, AbortController>());
  // Monotonic per-key ticket: a response whose ticket is not the current one is
  // answering a question the operator has already moved past.
  const tickets = useRef(new Map<string, number>());
  // React 18 StrictMode double-invokes effects; this guards the unmount sweep
  // from tearing down probes belonging to the surviving mount.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const pendingTimers = timers.current;
    const pendingRequests = inFlight.current;
    return () => {
      mounted.current = false;
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
      for (const controller of pendingRequests.values()) controller.abort();
      pendingRequests.clear();
    };
  }, []);

  const setMessage = useCallback((key: string, message: string | null) => {
    setErrors((prev) => {
      if (message === null) {
        if (prev[key] === undefined) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === message) return prev;
      return { ...prev, [key]: message };
    });
  }, []);

  const run = useCallback(
    async (key: string, value: SettingValue, ticket: number) => {
      inFlight.current.get(key)?.abort();
      const controller = new AbortController();
      inFlight.current.set(key, controller);
      try {
        // A single-key body: we are answering "is THIS field ok", and sending
        // the whole draft would attribute a neighbour's problem to this row.
        const res = await api.validateInstanceSettings(
          { [key]: value },
          controller.signal,
        );
        if (!mounted.current || tickets.current.get(key) !== ticket) return;
        const issue = res.fields.find((f) => f.field === key);
        setMessage(key, issue?.message ?? null);
      } catch {
        // Aborted, offline, or the endpoint is missing on an older server: stay
        // quiet and let the save-time 422 do its job. See the doc comment.
      } finally {
        if (inFlight.current.get(key) === controller)
          inFlight.current.delete(key);
      }
    },
    [setMessage],
  );

  const validateKey = useCallback(
    (key: string, value: SettingValue) => {
      const existing = timers.current.get(key);
      if (existing !== undefined) clearTimeout(existing);
      const ticket = (tickets.current.get(key) ?? 0) + 1;
      tickets.current.set(key, ticket);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          void run(key, value, ticket);
        }, VALIDATE_DEBOUNCE_MS),
      );
    },
    [run],
  );

  const clearKey = useCallback(
    (key: string) => {
      const timer = timers.current.get(key);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.current.delete(key);
      }
      inFlight.current.get(key)?.abort();
      inFlight.current.delete(key);
      // Bump the ticket so any response already in the air is ignored.
      tickets.current.set(key, (tickets.current.get(key) ?? 0) + 1);
      setMessage(key, null);
    },
    [setMessage],
  );

  const reset = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    for (const controller of inFlight.current.values()) controller.abort();
    inFlight.current.clear();
    for (const [key, ticket] of tickets.current)
      tickets.current.set(key, ticket + 1);
    setErrors({});
  }, []);

  return { errors, validateKey, clearKey, reset };
}
