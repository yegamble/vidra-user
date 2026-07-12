// Per-user player settings (PLAY-07). This is the signed-in supersession of the
// three interim session stores (lib/player-{rates,theater,autoplay}): when a
// user is signed in, the server-backed defaults (GET/PUT /api/v1/me/player-
// settings, vidra-core W1.C3) are the *effective defaults* the bespoke player
// starts from. An in-session control change (the SpeedMenu, the shell's theater
// toggle, the end card's autoplay switch) still writes the session store, which
// wins for the rest of that browsing session; only when a session store is unset
// does the effective per-user default apply. Signed-out users keep the baked
// defaults + session stores exactly as before.
//
// This module is the low-level effective-settings holder. It deliberately does
// NOT import the three session stores (they import the getter below for their
// fallback — one direction, no cycle). The React entry point is
// usePlayerSettings(); WatchView hydrates the holder from the server for the
// watch page, and PlayerSettingsView edits it.

import { useSyncExternalStore } from "react";

import { AUTO_LEVEL, type LevelOption } from "@/lib/hls";
import type { PlayerSettings } from "@/lib/api";

/**
 * The baked player defaults — identical to the pre-W1.6 behaviour (speed 1×,
 * autoplay on, quality Auto, captions off, theater off) and to the server's
 * built-in defaults for a user who never saved. Used for SSR, for signed-out
 * users, and until a signed-in user's settings hydrate.
 */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  autoplay_next: true,
  default_speed: 1,
  default_quality: "auto",
  captions_default: false,
  theater_default: false,
};

// The window event the holder broadcasts on hydrate/reset. The session stores
// (lib/player-rates etc.) subscribe to it so a player re-reads its effective
// default when the per-user settings land, and usePlayerSettings re-renders.
export const PLAYER_SETTINGS_EVENT = "vidra:player-settings";

// Module-level effective settings. A fresh object on every change so
// useSyncExternalStore's Object.is check schedules a re-render; stable between
// changes so getSnapshot never loops.
let current: PlayerSettings = DEFAULT_PLAYER_SETTINGS;
// Whether `current` is a signed-in user's server-backed settings (hydrated)
// rather than the baked defaults. Readers that layer the INSTANCE defaults
// underneath (config-parity W5: lib/player-autoplay) use this to tell "the
// user's stored preference" apart from "nobody said anything yet".
let hydrated = false;

/** getPlayerSettingsSnapshot returns the current effective per-user defaults.
 * Read by the session stores' fallback and by getSnapshot below. */
export function getPlayerSettingsSnapshot(): PlayerSettings {
  return current;
}

/** True once a signed-in user's server-backed settings were installed (and
 * until sign-out resets them) — the per-user layer of the preference chain. */
export function arePlayerSettingsHydrated(): boolean {
  return hydrated;
}

function broadcast(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PLAYER_SETTINGS_EVENT));
}

/** hydratePlayerSettings installs the server's effective settings (after a GET,
 * or after a PUT returns the merged object) and notifies every subscriber — open
 * players re-read their effective defaults, PlayerSettingsView re-renders. */
export function hydratePlayerSettings(settings: PlayerSettings): void {
  current = settings;
  hydrated = true;
  broadcast();
}

/** resetPlayerSettings drops back to the baked defaults (on sign-out) so a
 * signed-out session never inherits the previous user's per-user defaults. */
export function resetPlayerSettings(): void {
  current = DEFAULT_PLAYER_SETTINGS;
  hydrated = false;
  broadcast();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PLAYER_SETTINGS_EVENT, onChange);
  return () => window.removeEventListener(PLAYER_SETTINGS_EVENT, onChange);
}

function serverSnapshot(): PlayerSettings {
  return DEFAULT_PLAYER_SETTINGS;
}

/** usePlayerSettings subscribes a component to the effective per-user defaults.
 * SSR + the pre-hydration client render see the baked defaults (no mismatch);
 * after the watch page hydrates, the component re-renders with the real values.
 * The bespoke shell reads default_quality / captions_default from here. */
export function usePlayerSettings(): PlayerSettings {
  return useSyncExternalStore(subscribe, getPlayerSettingsSnapshot, serverSnapshot);
}

// --- default-quality ⇄ HLS level mapping ------------------------------------

/**
 * The Select options for "Default quality": Auto plus the common rungs. The
 * value is the contract shape ("auto" or `<height>p`); a stored default that is
 * not offered here still round-trips (it just isn't one of these presets).
 */
export const QUALITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "2160p", label: "2160p (4K)" },
  { value: "1440p", label: "1440p" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  { value: "360p", label: "360p" },
];

/**
 * matchQualityLevel maps a stored default_quality onto an hls.js level index for
 * the parsed quality menu. "auto" — or a rung this video doesn't offer (an
 * unknown / unavailable height) — maps to AUTO_LEVEL, so the player stays on
 * adaptive rather than forcing a rung that doesn't exist. A matching rung maps to
 * its hls.js level index (the value the quality menu assigns).
 */
export function matchQualityLevel(defaultQuality: string, levels: LevelOption[]): number {
  if (defaultQuality === "auto") return AUTO_LEVEL;
  const match = levels.find((l) => l.level !== AUTO_LEVEL && l.label === defaultQuality);
  return match ? match.level : AUTO_LEVEL;
}
