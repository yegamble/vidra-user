import { api } from "@/lib/api";

// The header bell and the bottom tab bar both refresh the unread count on every
// navigation. One shared request per navigation keeps that to a single call on
// the per-IP API budget instead of two.
let inflight: { key: string; promise: Promise<number> } | null = null;

export function fetchUnreadNotificationCount(key: string): Promise<number> {
  if (inflight?.key === key) return inflight.promise;
  const promise = api.getUnreadNotificationCount().then((res) => res.unread_count);
  const entry = { key, promise };
  inflight = entry;
  // Settled results are never reused: the next navigation (or a revisit) refetches.
  const clear = () => {
    if (inflight === entry) inflight = null;
  };
  promise.then(clear, clear);
  return promise;
}
