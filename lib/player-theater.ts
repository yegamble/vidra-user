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
// Persistence is session-only in this slice (survives reloads/navigations within
// the tab, never leaks past it). DEPENDENCY (recorded): W1.U6's signed-in
// `theater_default` (GET/PUT /me/player-settings, backed by vidra-core W1.C3)
// supersedes this session stop-gap. Deviation from the upstream plan's
// `?theater=1` URL param — recorded: URL params leak into shares.

const THEATER_KEY = "vidra.theater";
const THEATER_EVENT = "vidra:theater";

/** subscribeTheater notifies on any theater change (this tab via the custom
 * event, or another tab via `storage`). For useSyncExternalStore. */
export function subscribeTheater(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEATER_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEATER_EVENT, onChange);
  };
}

/** serverTheater is the SSR snapshot for useSyncExternalStore — always off, so
 * the server HTML never disagrees with the pre-hydration client. */
export function serverTheater(): boolean {
  return false;
}

/**
 * readStoredTheater returns the session's remembered theater state. Anything but
 * the exact stored "on" marker (unset, "0", or a corrupt value) reads as off.
 * Safe when storage is unavailable (private mode).
 */
export function readStoredTheater(): boolean {
  try {
    return window.sessionStorage.getItem(THEATER_KEY) === "1";
  } catch {
    return false;
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
