import { cache } from "react";

import type { PublicUserProfile } from "@/lib/api/types";
import { internalApiBaseUrl } from "@/lib/config";

export const getPublicUserProfile = cache(
  async (username: string): Promise<PublicUserProfile | null> => {
    try {
      const res = await fetch(
        `${internalApiBaseUrl}/api/v1/users/${encodeURIComponent(username)}/profile`,
        {
          headers: { Accept: "application/json" },
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
