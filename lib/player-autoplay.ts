// Autoplay-next preference (PLAY-08). Pure module — only the guarded
// session-persistence helpers — so the store is unit-testable in isolation
// (lib/player-autoplay.test.ts), mirroring lib/player-theater's shape.
//
// The end card honours this "effective" autoplay-next preference. In this slice
// the scope is a per-browsing-session toggle with a baked default of ON — the
// signed-out default the spec mandates. The on-card "Autoplay next" switch writes
// here, so the choice survives reloads/navigations within the tab (never past
// it). Both the card and any future reader use the one external store (the house
// useSyncExternalStore pattern), so they stay in lockstep without prop-drilling.
//
// DEPENDENCY (recorded): W1.U6's signed-in `autoplay_next` (GET/PUT
// /me/player-settings, backed by vidra-core W1.C3 — ABSENT from openapi as of
// 2026-07-07) supersedes this session stop-gap once it lands; this store is the
// interim default source.

const AUTOPLAY_KEY = "vidra.autoplay-next";
const AUTOPLAY_EVENT = "vidra:autoplay-next";

/** subscribeAutoplay notifies on any autoplay change (this tab via the custom
 * event, or another tab via `storage`). For useSyncExternalStore. */
export function subscribeAutoplay(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(AUTOPLAY_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(AUTOPLAY_EVENT, onChange);
  };
}

/** serverAutoplay is the SSR snapshot for useSyncExternalStore — the baked
 * default (ON), so the server HTML never disagrees with the pre-hydration
 * client (unset storage also reads ON). */
export function serverAutoplay(): boolean {
  return true;
}

/**
 * readStoredAutoplay returns the session's remembered autoplay preference.
 * Default ON: only the explicit "0" marker turns it off; unset or a corrupt
 * value reads as on. Safe when storage is unavailable (private mode).
 */
export function readStoredAutoplay(): boolean {
  try {
    return window.sessionStorage.getItem(AUTOPLAY_KEY) !== "0";
  } catch {
    return true;
  }
}

/** setAutoplay remembers the preference for the session and broadcasts the
 * change to every subscribed reader. A no-op write when storage is unavailable
 * (private mode) — the choice still applies in-tab via the event. */
export function setAutoplay(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTOPLAY_KEY, on ? "1" : "0");
  } catch {
    /* storage disabled — non-fatal */
  }
  window.dispatchEvent(new Event(AUTOPLAY_EVENT));
}

/** toggleAutoplay flips the current session preference. Used by the end card's
 * "Autoplay next" switch. */
export function toggleAutoplay(): void {
  setAutoplay(!readStoredAutoplay());
}
