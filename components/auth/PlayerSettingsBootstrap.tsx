"use client";

import { useEffect } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";
import {
  beginPlayerSettingsLoad,
  hydratePlayerSettings,
  resetPlayerSettings,
} from "@/lib/player-settings";
import { resetVideoCardPreviewAudio } from "@/lib/video-card-preview-session";

/**
 * Hydrate playback preferences once for the whole signed-in browsing session.
 * Video-card previews live outside the watch page, so loading these settings
 * only inside WatchView would leave home/search/subscription cards permanently
 * on the baked defaults. A failed request remains safely unsettled (previews
 * stay off); signing out clears the previous account's values immediately.
 */
export function PlayerSettingsBootstrap() {
  const { status, user } = useSession();

  useEffect(() => {
    if (status === "restoring") return;
    if (status !== "authed") {
      resetPlayerSettings();
      resetVideoCardPreviewAudio();
      return;
    }

    beginPlayerSettingsLoad();
    const controller = new AbortController();
    api
      .getPlayerSettings(controller.signal)
      .then((settings) => hydratePlayerSettings(settings))
      .catch(() => {
        // Keep the defaults unsettled: an unknown preference must never opt a
        // viewer into automatic media loading or playback.
      });
    return () => controller.abort();
  }, [status, user?.id]);

  return null;
}
