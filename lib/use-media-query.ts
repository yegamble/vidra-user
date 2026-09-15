"use client";

import { useSyncExternalStore } from "react";

/**
 * useMediaQuery — a media query read in JS that KEEPS READING (the same lesson
 * lib/use-prefers-reduced-motion.ts records: `matchMedia(q).matches` evaluated
 * once silently split-brains against the stylesheet the moment the viewport
 * changes, for the rest of the session).
 *
 * useSyncExternalStore rather than useState+useEffect, so the value is never
 * read during a render it has already invalidated and the server snapshot is
 * STATED: SSR has no viewport, and `false` is the only answer that hydrates
 * without a mismatch. Callers must therefore treat `false` as "not yet known to
 * match", never as "definitely narrow".
 *
 * The subscribe/getSnapshot pair is memoised per query string because
 * useSyncExternalStore re-subscribes whenever `subscribe` changes identity, and
 * a fresh closure per render would tear the listener down and up on every
 * render.
 */
const cache = new Map<
  string,
  { subscribe: (onChange: () => void) => () => void; getSnapshot: () => boolean }
>();

function usable(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function store(query: string) {
  const hit = cache.get(query);
  if (hit) return hit;
  const entry = {
    subscribe(onChange: () => void): () => void {
      if (!usable()) return () => {};
      const mql = window.matchMedia(query);
      // Safari below 14 exposes only the deprecated addListener/removeListener.
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      }
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    },
    getSnapshot(): boolean {
      return usable() ? window.matchMedia(query).matches : false;
    },
  };
  cache.set(query, entry);
  return entry;
}

function serverSnapshot(): boolean {
  return false;
}

export function useMediaQuery(query: string): boolean {
  const { subscribe, getSnapshot } = store(query);
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}

/**
 * The watch page's two-column breakpoint (Tailwind `xl`), shared by the JS that
 * has to agree with `.watch-layout`'s media query: theater mode, and the
 * immersive flag that hides the app rail for it. Below this width the watch
 * page is a single column, there is no second column for theater to collapse
 * and no width for it to gain — so theater is inert there, in CSS and in JS,
 * from one number.
 */
export const WATCH_TWO_COLUMN_QUERY = "(min-width: 1280px)";
