import { cache } from "react";

import type { PublicUserProfile } from "@/lib/api/types";
import { serverJson } from "@/lib/server-json";

export const getPublicUserProfile = cache(
  async (username: string): Promise<PublicUserProfile | null> =>
    serverJson<PublicUserProfile>(
      `/api/v1/users/${encodeURIComponent(username)}/profile`,
      {
        // Visibility changes must take effect immediately; never serve a
        // cached public profile after its owner makes it private.
        freshness: "no-store",
        // Uncached and once per profile render, so it spends the viewer's
        // rate-limit budget, not the frontend container's shared one.
        forwardClientIp: true,
        timeoutMs: 5000,
      },
    ),
);
