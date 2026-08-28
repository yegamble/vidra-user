import { cache } from "react";

import { EMPTY_INSTANCE_ABOUT } from "@/lib/api/instance-platform";
import type { InstanceAboutResponse, InstanceResponse } from "@/lib/api/types";
import { serverJson } from "@/lib/server-json";

/** Current public instance data for the About identity shell. */
export const getInstanceAboutInstance = cache(
  async (): Promise<InstanceResponse | null> =>
    serverJson<InstanceResponse>("/api/v1/instance", {
      // About is a navigation destination, not site metadata. Fetch it at
      // request time so the route never bakes a development/build snapshot
      // into the loading bootstrap.
      freshness: "no-store",
      // Uncached (above), so each About view is one more request against the
      // limiter — bill it to the viewer, not to the container.
      forwardClientIp: true,
      timeoutMs: 5000,
    }),
);

/**
 * Fetch the public About document before committing an About-route navigation.
 *
 * The About UI used to mount first, paint a centered spinner, and only then
 * request this document in the browser. On a healthy local API that spinner
 * lasted just one or two frames, which made every navigation look like a
 * flash. Bootstrapping the public data in the route keeps the outgoing page on
 * screen until the complete About shell is ready.
 *
 * Null (from any other failure) keeps the browser fetch as a resilience
 * fallback when SSR cannot reach the API — including the route-mocked
 * Playwright suite.
 */
export const getInstanceAboutDocument = cache(
  async (): Promise<InstanceAboutResponse | null> =>
    serverJson<InstanceAboutResponse>("/api/v1/instance/about", {
      // Same reasoning as getInstanceAboutInstance above.
      freshness: "no-store",
      forwardClientIp: true,
      timeoutMs: 5000,
      // An unset About document is a valid, stable empty state.
      on404: EMPTY_INSTANCE_ABOUT,
    }),
);
