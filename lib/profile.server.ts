import { cache } from "react";

import type { PublicUserProfile } from "@/lib/api/types";
import { clientIpForwardHeaders } from "@/lib/client-ip.server";
import { internalApiBaseUrl } from "@/lib/config";

export const getPublicUserProfile = cache(
  async (username: string): Promise<PublicUserProfile | null> => {
    try {
      const res = await fetch(
        `${internalApiBaseUrl}/api/v1/users/${encodeURIComponent(username)}/profile`,
        {
          // Uncached and once per profile render, so it spends the viewer's
          // rate-limit budget, not the frontend container's shared one.
          headers: { Accept: "application/json", ...(await clientIpForwardHeaders()) },
          // Visibility changes must take effect immediately; never serve a
          // cached public profile after its owner makes it private.
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) return null;
      return (await res.json()) as PublicUserProfile;
    } catch {
      return null;
    }
  },
);
