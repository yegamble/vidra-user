// Autoplay preference (PLAY-08 + config-parity W5). Pure module — only the
// guarded session-persistence helpers — so the store is unit-testable in
// isolation (lib/player-autoplay.test.ts), mirroring lib/player-theater's shape.
//
// The end card honours the "effective" autoplay-next preference; since W5 the
// same effective value also drives START-ON-OPEN (whether the watch page's
// player begins playing on load). The preference chain, strongest first:
//
//   1. the session's explicit choice (the end card's switch — sessionStorage)
//   2. a signed-in user's server-backed `autoplay_next` (migration 0075,
//      hydrated into lib/player-settings) — an explicit stored user pref is
//      NEVER overridden by the instance default
//   3. the instance's `defaults.player_autoplay` (GET /instance, W5) — the
//      operator seed for anonymous/unset users. DOCUMENTED DEVIATION: one
//      instance key seeds BOTH autoplay-next and start-on-open (PeerTube's
//      auto_play is start-on-open only; vidra's stored pref is autoplay-next)
//   4. the baked ON default (the pre-W5 signed-out behavior)
//
// Start-on-open additionally requires the instance signal to EXIST: with no
// defaults block (old backend, backend down, mocked e2e) the player keeps
// today's behavior and never auto-starts (readStartOnOpen → false). And
// because start-on-open is a SIDE EFFECT (an el.play() that latches — a later
// correction can't quietly un-play), it also waits for the per-user layer to
// SETTLE (arePlayerSettingsSettled): the instance-defaults store is often
// primed before a signed-in user's autoplay_next has hydrated (feed→watch SPA
// navigation), and the seed must never beat a stored "off" to the punch.

import {
  getInstanceDefaultsSnapshot,
  subscribeInstanceDefaults,
} from "@/lib/instance-defaults";
import {
  PLAYER_SETTINGS_EVENT,
  arePlayerSettingsHydrated,
  arePlayerSettingsSettled,
  getPlayerSettingsSnapshot,
} from "@/lib/player-settings";

const AUTOPLAY_KEY = "vidra.autoplay-next";
const AUTOPLAY_EVENT = "vidra:autoplay-next";

/** subscribeAutoplay notifies on any autoplay change (this tab via the custom
 * event, another tab via `storage`, the per-user settings hydrating, or the
 * instance defaults landing). */
export function subscribeAutoplay(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(AUTOPLAY_EVENT, onChange);
  window.addEventListener(PLAYER_SETTINGS_EVENT, onChange);
  const unsubscribeDefaults = subscribeInstanceDefaults(onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(AUTOPLAY_EVENT, onChange);
    window.removeEventListener(PLAYER_SETTINGS_EVENT, onChange);
    unsubscribeDefaults();
  };
}

/** serverAutoplay is the SSR snapshot for useSyncExternalStore — the baked
 * default (ON), so the server HTML never disagrees with the pre-hydration
 * client (unset storage also reads ON). */
export function serverAutoplay(): boolean {
  return true;
}

/** The session's explicit "1"/"0" marker, or null when unset/corrupt/blocked. */
function readSessionAutoplay(): boolean | null {
  try {
    const raw = window.sessionStorage.getItem(AUTOPLAY_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null; // storage unavailable (private mode)
  }
}

/**
 * readStoredAutoplay returns the effective autoplay-next preference per the
 * chain above: session choice → hydrated per-user pref → instance default →
 * baked ON. Safe when storage is unavailable (private mode).
 */
export function readStoredAutoplay(): boolean {
  const session = readSessionAutoplay();
  if (session !== null) return session;
  if (arePlayerSettingsHydrated()) return getPlayerSettingsSnapshot().autoplay_next;
  return getInstanceDefaultsSnapshot()?.player_autoplay ?? true;
}

/**
 * readStartOnOpen returns whether the watch player should attempt playback on
 * open (config-parity W5). false while the instance carries no player_autoplay
 * signal — today's exact behavior, the player waits for a click. Once the
 * instance seeds it, the same explicit user preferences win (chain above), so
 * a viewer who switched autoplay off is never auto-started either.
 *
 * Held (false) until the per-user settings layer settles: on a feed→watch SPA
 * navigation the instance defaults are already primed while a signed-in
 * user's server-backed autoplay_next (migration 0075) is still in flight, and
 * an el.play() fired on the seed alone would auto-start a user who explicitly
 * said no. WatchView settles the layer both ways (hydrate on signed-in
 * success, reset for anonymous visitors); a failed fetch never settles —
 * conservative click-to-play beats guessing. An explicit session choice is
 * the strongest layer of the chain, so it alone doesn't wait.
 */
export function readStartOnOpen(): boolean {
  const seeded = getInstanceDefaultsSnapshot()?.player_autoplay;
  if (seeded === undefined) return false;
  if (readSessionAutoplay() === null && !arePlayerSettingsSettled()) return false;
  return readStoredAutoplay();
}

/** SSR snapshot for start-on-open — always false (defaults are client-fetched). */
export function serverStartOnOpen(): boolean {
  return false;
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
