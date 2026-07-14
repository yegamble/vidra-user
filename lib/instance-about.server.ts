import { cache } from "react";

import { EMPTY_INSTANCE_ABOUT } from "@/lib/api/instance-platform";
import type { InstanceAboutResponse, InstanceResponse } from "@/lib/api/types";
import { internalApiBaseUrl } from "@/lib/config";

/** Current public instance data for the About identity shell. */
export const getInstanceAboutInstance = cache(async (): Promise<InstanceResponse | null> => {
  try {
    const res = await fetch(`${internalApiBaseUrl}/api/v1/instance`, {
      headers: { Accept: "application/json" },
      // About is a navigation destination, not site metadata. Fetch it at
      // request time so the route never bakes a development/build snapshot
      // into the loading bootstrap.
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as InstanceResponse;
  } catch {
    return null;
  }
});

/**
 * Fetch the public About document before committing an About-route navigation.
 *
 * The About UI used to mount first, paint a centered spinner, and only then
 * request this document in the browser. On a healthy local API that spinner
 * lasted just one or two frames, which made every navigation look like a
 * flash. Bootstrapping the public data in the route keeps the outgoing page on
 * screen until the complete About shell is ready.
 */
export const getInstanceAboutDocument = cache(
  async (): Promise<InstanceAboutResponse | null> => {
    try {
      const res = await fetch(`${internalApiBaseUrl}/api/v1/instance/about`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      // An unset About document is a valid, stable empty state.
      if (res.status === 404) return EMPTY_INSTANCE_ABOUT;
      if (!res.ok) return null;
      return (await res.json()) as InstanceAboutResponse;
    } catch {
      // Keep the browser fetch as a resilience fallback when SSR cannot reach
      // the API (including the route-mocked Playwright suite).
      return null;
    }
  },
);
