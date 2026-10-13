"use client";

import { useEffect } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import { hydrateContentPreferences, resetContentPreferences } from "@/lib/content-preferences";

/**
 * Hydrate the viewer's content preferences once per signed-in session, so every
 * grid tile and the watch gate can apply per-flag sensitive policies. Until the
 * request lands (or if it fails) the viewer has no overrides, i.e. their base
 * policy applies — core still enforces "hide" regardless.
 */
export function ContentPreferencesBootstrap() {
  const { status, user } = useSession();

  useEffect(() => {
    if (status === "restoring") return;
    resetContentPreferences();
    if (status !== "authed") return;
    const controller = new AbortController();
    api
      .getContentPreferences(controller.signal)
      .then(hydrateContentPreferences)
      .catch(() => {
        // Keep "no overrides"; the base policy applies.
      });
    return () => controller.abort();
  }, [status, user?.id]);

  return null;
}
