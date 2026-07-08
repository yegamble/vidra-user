// Playback-speed ladder for the custom player (PLAY-03). Pure — no React, no
// DOM globals except the guarded session-persistence helpers — so the ladder,
// its labels and the `<`/`>` stepping maths are unit-testable in isolation
// (lib/player-rates.test.ts).
//
// This is the SINGLE shared source of the rate ladder: the SpeedMenu, the shell
// keyboard step helper, the W1.U6 player-settings "Default speed" Select and the
// vidra-core W1.C3 server-side validation must all agree with this list — keep
// them in lockstep.

import {
  PLAYER_SETTINGS_EVENT,
  getPlayerSettingsSnapshot,
} from "@/lib/player-settings";

/** The selectable playback rates (native video.playbackRate), 0.25×–4×. */
export const PLAYBACK_RATES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4,
] as const;

/** The default (and reset) rate — normal speed. */
export const DEFAULT_PLAYBACK_RATE = 1;

/** True when `rate` is exactly one of the selectable rungs. */
export function isPlaybackRate(rate: number): boolean {
  return (PLAYBACK_RATES as readonly number[]).includes(rate);
}

/** normalizePlaybackRate coerces any value to a valid rung: an off-ladder or
 * non-finite input (a corrupt stored value, or a bad server default_speed) falls
 * back to normal speed — the "invalid stored speed → 1" rule W1.6 requires. */
export function normalizePlaybackRate(rate: number): number {
  return isPlaybackRate(rate) ? rate : DEFAULT_PLAYBACK_RATE;
}

/** The button/menu label for a rate, e.g. `1×`, `1.5×`, `0.25×`. */
export function rateLabel(rate: number): string {
  return `${rate}×`;
}

/**
 * stepPlaybackRate moves one rung along the ladder: `direction > 0` returns the
 * next rung strictly greater than `current` (the `>` shortcut), otherwise the
 * next rung strictly less than it (the `<` shortcut). Off-ladder inputs snap to
 * the neighbouring rung; at the ends the rate is clamped (stays put). Every rung
 * is an exact binary fraction (a multiple of 0.25), so the comparisons are
 * float-safe.
 */
export function stepPlaybackRate(current: number, direction: number): number {
  if (direction > 0) {
    const up = PLAYBACK_RATES.find((r) => r > current);
    return up ?? PLAYBACK_RATES[PLAYBACK_RATES.length - 1];
  }
  const down = [...PLAYBACK_RATES].reverse().find((r) => r < current);
  return down ?? PLAYBACK_RATES[0];
}

// --- session + per-user persistence ------------------------------------------
// The chosen speed is remembered for the browsing SESSION (sessionStorage), so it
// survives reloads/navigations within the tab but never leaks past it. This is
// the in-session OVERRIDE layer: a value the user picked this session wins. When
// no session value is stored, the fallback is the signed-in user's effective
// `default_speed` (GET /api/v1/me/player-settings, hydrated into
// lib/player-settings), or the baked default for signed-out users — so a fresh
// (untouched) session honours the per-user default.
//
// Read through useSyncExternalStore (the house pattern — see Sidebar's collapse
// preference): serverRate is the SSR snapshot (baked default), readStoredRate the
// client snapshot after hydration (no server/client render mismatch), and
// storeRate writes + broadcasts so every player in the tab re-reads at once.
// subscribeRate also re-reads when the per-user settings hydrate.

const RATE_KEY = "vidra.player.speed";
const RATE_EVENT = "vidra:player-speed";

/** subscribeRate notifies on any speed change (this tab via the custom event,
 * another tab via `storage`, or the per-user settings hydrating). */
export function subscribeRate(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(RATE_EVENT, onChange);
  window.addEventListener(PLAYER_SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RATE_EVENT, onChange);
    window.removeEventListener(PLAYER_SETTINGS_EVENT, onChange);
  };
}

/** serverRate is the SSR snapshot for useSyncExternalStore — always the baked
 * default, so the server HTML never disagrees with the pre-hydration client. */
export function serverRate(): number {
  return DEFAULT_PLAYBACK_RATE;
}

/**
 * readStoredRate returns the session's remembered rate; when none is stored
 * (unset, corrupt, or an off-ladder value) it falls back to the effective
 * per-user `default_speed` (baked default for signed-out users), normalized so
 * an invalid server value still lands on 1. Safe when storage is unavailable
 * (private mode).
 */
export function readStoredRate(): number {
  const fallback = normalizePlaybackRate(getPlayerSettingsSnapshot().default_speed);
  try {
    const raw = window.sessionStorage.getItem(RATE_KEY);
    if (raw === null) return fallback;
    const n = Number(raw);
    return isPlaybackRate(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** storeRate remembers the chosen rate for the session and broadcasts the change
 * to every subscribed player. A no-op when storage is unavailable (private
 * mode) — the rate still applies in-session. */
export function storeRate(rate: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RATE_KEY, String(rate));
  } catch {
    /* storage disabled — non-fatal */
  }
  window.dispatchEvent(new Event(RATE_EVENT));
}
