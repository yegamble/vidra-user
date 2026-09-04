"use client";

import { useEffect } from "react";

/**
 * useShortWatchUrl shows the canonical short link in the address bar when the
 * page was reached by its uuid.
 *
 * /videos/{uuid} keeps rendering — it is not redirected — so without this a
 * viewer who followed an old link, or arrived via /w/ or a search result, sees
 * and copies a 36-character uuid. Copying out of the address bar is the
 * dominant share vector, so this is what stops the long form re-propagating.
 *
 * DISPLAY ONLY. It does not navigate: /videos/{uuid} stays the route React is
 * rendering. A reload of the rewritten URL hits /v/{code}, which renders the
 * same page, so bookmarking or copying keeps working.
 *
 * It now uses the STORED short code rather than a sid derived from the uuid.
 * The derived form still resolves, but showing it here would put a second short
 * form in circulation for every link a viewer copies — and it is not the URL the
 * page declares canonical.
 *
 * Note the address bar KEEPS `?t=` while the canonical STRIPS it: a start time
 * names a moment in a video, not a different video. Two rules, opposite ways.
 *
 * The existing history state is passed through rather than replaced with null:
 * the App Router keeps its own routing record in there, and dropping it makes
 * the next back/forward navigation lose its place.
 */
export function useShortWatchUrl(shortCode: string | undefined): void {
  useEffect(() => {
    if (shortCode === undefined || shortCode === "") return;
    // Only when the bar is showing the uuid form. This also covers the
    // render-before-navigation window (the browser still shows the previous
    // video's URL), the embed/live/remote surfaces, and a page already on /v/.
    if (!window.location.pathname.startsWith("/videos/")) return;
    const next = `/v/${shortCode}${window.location.search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", next);
  }, [shortCode]);
}
