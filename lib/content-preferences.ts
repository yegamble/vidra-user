// The signed-in viewer's content preferences (per-flag sensitive policies),
// held module-level like lib/player-settings so every video tile reads them
// without a fetch per grid. ContentPreferencesBootstrap hydrates it once for the
// whole session; ContentSettingsView edits it. Signed-out viewers have none.

import { useSyncExternalStore } from "react";

import type { ContentPreferences } from "@/lib/api";

export const NO_CONTENT_PREFERENCES: ContentPreferences = {
  sensitive_flag_policies: {},
  preferred_languages: [],
};

const EVENT = "vidra:content-preferences";

let current: ContentPreferences = NO_CONTENT_PREFERENCES;
// Whether the signed-in question has been ANSWERED (hydrated, or given up on
// after a failed fetch). The feed holds its first request until then, so a
// viewer with preferred languages does not load the unfiltered feed first.
let settled = false;

function broadcast(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** Install the server's preferences (after a GET, or the PUT's response). */
export function hydrateContentPreferences(prefs: ContentPreferences): void {
  current = prefs;
  settled = true;
  broadcast();
}

/** The fetch failed: stop waiting, with no overrides and no language filter. */
export function settleContentPreferences(): void {
  settled = true;
  broadcast();
}

/** Drop back to "no overrides" (sign-out, anonymous visitor, account switch). */
export function resetContentPreferences(): void {
  current = NO_CONTENT_PREFERENCES;
  settled = false;
  broadcast();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** useContentPreferences: SSR and the pre-hydration render see no overrides. */
export function useContentPreferences(): ContentPreferences {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => NO_CONTENT_PREFERENCES,
  );
}

/** True once the viewer's preferences are known (or known to be unavailable). */
export function useContentPreferencesSettled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => settled,
    () => false,
  );
}
