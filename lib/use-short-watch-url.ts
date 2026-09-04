"use client";

import { useEffect } from "react";

import { shortWatchUrl } from "@/lib/short-id";

/**
 * useShortWatchUrl shows the short share link in the address bar while the page
 * stays on its canonical route.
 *
 * The rewrite is display-only and deliberately does not navigate: /videos/{uuid}
 * remains the route React is rendering and the URL every piece of metadata
 * points at, so nothing about canonicalisation, view counting or crawler dedup
 * moves. A reload of the rewritten URL hits /v/{sid}, which 301s straight back
 * here, so bookmarking or copying out of the address bar keeps working.
 *
 * The existing history state is passed through rather than replaced with null:
 * the App Router keeps its own routing record in there, and dropping it makes
 * the next back/forward navigation lose its place.
 */
export function useShortWatchUrl(id: string): void {
  useEffect(() => {
    const next = shortWatchUrl(id, window.location.pathname, window.location.search);
    if (next === null) return;
    window.history.replaceState(window.history.state, "", next);
  }, [id]);
}
