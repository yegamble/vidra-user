// Theater-mode state for the watch page (PLAY-04). Pure module — no React, only
// the guarded session-persistence helpers — so the store is unit-testable in
// isolation (lib/player-theater.test.ts).
//
// Theater is a PAGE-layout concern, not a player-internal one: the toggle lives
// in the bespoke player shell (VideoPlayer, watch variant only), but the layout
// reaction — the player column widening to the full content width and the
// RelatedVideos rail reflowing below — happens in WatchView. Both read this one
// external store (the house useSyncExternalStore pattern, mirroring
// lib/player-rates' speed store), so the button's aria-pressed and the page
// layout stay in lockstep without prop-drilling or a context provider.
//
// Persistence is session-only for an in-session OVERRIDE (survives reloads/
// navigations within the tab, never leaks past it). When no session value is
// stored, the fallback is the signed-in user's effective `theater_default`
// (GET /api/v1/me/player-settings, hydrated into lib/player-settings), or off for
// signed-out users. Deviation from the upstream plan's `?theater=1` URL param —
// recorded: URL params leak into shares.

import {
  PLAYER_SETTINGS_EVENT,
  getPlayerSettingsSnapshot,
} from "@/lib/player-settings";

const THEATER_KEY = "vidra.theater";
const THEATER_EVENT = "vidra:theater";

/** subscribeTheater notifies on any theater change (this tab via the custom
 * event, another tab via `storage`, or the per-user settings hydrating). */
export function subscribeTheater(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEATER_EVENT, onChange);
  window.addEventListener(PLAYER_SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEATER_EVENT, onChange);
    window.removeEventListener(PLAYER_SETTINGS_EVENT, onChange);
  };
}

/** serverTheater is the SSR snapshot for useSyncExternalStore — always off, so
 * the server HTML never disagrees with the pre-hydration client. */
export function serverTheater(): boolean {
  return false;
}

/**
 * readStoredTheater returns the session's remembered theater state: the exact
 * "1"/"0" markers win (an in-session choice); when unset — or a corrupt value —
 * it falls back to the effective per-user `theater_default` (off for signed-out
 * users). Safe when storage is unavailable (private mode).
 */
export function readStoredTheater(): boolean {
  try {
    const raw = window.sessionStorage.getItem(THEATER_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return getPlayerSettingsSnapshot().theater_default;
  } catch {
    return getPlayerSettingsSnapshot().theater_default;
  }
}

/** setTheater remembers the mode for the session and broadcasts the change to
 * every subscribed reader (the shell button + WatchView layout). A no-op write
 * when storage is unavailable (private mode) — the mode still applies in-tab. */
export function setTheater(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(THEATER_KEY, on ? "1" : "0");
  } catch {
    /* storage disabled — non-fatal */
  }
  window.dispatchEvent(new Event(THEATER_EVENT));
}

/** toggleTheater flips the current session mode. Used by the shell's Theater
 * button (and, in W1.U8, the `t` keyboard shortcut). */
export function toggleTheater(): void {
  setTheater(!readStoredTheater());
}
