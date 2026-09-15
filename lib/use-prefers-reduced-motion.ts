"use client";

import { useSyncExternalStore } from "react";

// Reads the viewer's Reduce Motion preference and KEEPS READING IT. The app's
// reduced-motion behaviour is otherwise entirely CSS (app/globals.css zeroes
// every duration), which re-evaluates the moment the OS setting changes;
// anything that branches in JS has to subscribe or it silently split-brains
// against the stylesheet for the rest of the session. `matchMedia(...).matches`
// read once — the shape this replaced — is that bug.
//
// useSyncExternalStore rather than useState+useEffect so the value is never
// read during a render it has already invalidated, and so the server snapshot
// is stated rather than inferred: SSR has no media queries, and `false` is the
// only answer that hydrates without a mismatch (motion, then removed).
const QUERY = "(prefers-reduced-motion: reduce)";

function usable(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onStoreChange: () => void): () => void {
  if (!usable()) return () => {};
  const mql = window.matchMedia(QUERY);
  // Safari below 14 exposes only the deprecated addListener/removeListener.
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onStoreChange);
    return () => mql.removeEventListener("change", onStoreChange);
  }
  mql.addListener(onStoreChange);
  return () => mql.removeListener(onStoreChange);
}

function getSnapshot(): boolean {
  return usable() ? window.matchMedia(QUERY).matches : false;
}

/** No media queries on the server; assume motion is allowed and correct on mount. */
function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
