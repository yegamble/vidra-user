// Playback-speed ladder for the custom player (PLAY-03). Pure — no React, no
// DOM globals except the guarded session-persistence helpers — so the ladder,
// its labels and the `<`/`>` stepping maths are unit-testable in isolation
// (lib/player-rates.test.ts).
//
// This is the SINGLE shared source of the rate ladder: the SpeedMenu, the shell
// keyboard step helper, the W1.U6 player-settings "Default speed" Select and the
// vidra-core W1.C3 server-side validation must all agree with this list — keep
// them in lockstep.

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

// --- session persistence -----------------------------------------------------
// Stop-gap until the signed-in per-user player settings land (W1.U6 wires
// GET/PUT /api/v1/me/player-settings, backed by vidra-core W1.C3). Until then the
// chosen speed is remembered for the browsing session only (sessionStorage), so
// it survives reloads/navigations within the tab but never leaks past it and
// never masks a future server-side default. DEPENDENCY (recorded): W1.U6
// replaces this with the effective per-user `default_speed`.
//
// Read through useSyncExternalStore (the house pattern — see Sidebar's collapse
// preference): serverRate is the SSR snapshot (default), readStoredRate the
// client snapshot after hydration (no server/client render mismatch), and
// storeRate writes + broadcasts so every player in the tab re-reads at once.

const RATE_KEY = "vidra.player.speed";
const RATE_EVENT = "vidra:player-speed";

/** subscribeRate notifies on any speed change (this tab via the custom event, or
 * another tab via `storage`). For useSyncExternalStore. */
export function subscribeRate(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(RATE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RATE_EVENT, onChange);
  };
}

/** serverRate is the SSR snapshot for useSyncExternalStore — always the default,
 * so the server HTML never disagrees with the pre-hydration client. */
export function serverRate(): number {
  return DEFAULT_PLAYBACK_RATE;
}

/**
 * readStoredRate returns the session's remembered rate, or the default when
 * nothing valid is stored (unset, corrupt, or an off-ladder value — the same
 * "invalid stored speed → 1" guard W1.U6 applies to the server value). Safe when
 * storage is unavailable (private mode).
 */
export function readStoredRate(): number {
  try {
    const raw = window.sessionStorage.getItem(RATE_KEY);
    if (raw === null) return DEFAULT_PLAYBACK_RATE;
    const n = Number(raw);
    return isPlaybackRate(n) ? n : DEFAULT_PLAYBACK_RATE;
  } catch {
    return DEFAULT_PLAYBACK_RATE;
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
