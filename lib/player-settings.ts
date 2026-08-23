// Per-user player settings (PLAY-07). This is the signed-in supersession of the
// three interim session stores (lib/player-{rates,theater,autoplay}): when a
// user is signed in, the server-backed defaults (GET/PUT /api/v1/me/player-
// settings, vidra-core W1.C3) are the *effective defaults* the bespoke player
// starts from. An in-session control change (the SpeedMenu, the shell's theater
// toggle, the end card's autoplay switch) still writes the session store, which
// wins for the rest of that browsing session; only when a session store is unset
// does the effective per-user default apply. Signed-out users keep the baked
// defaults + session stores exactly as before. Video-card previews are an
// explicit opt-in and also require the public instance capability gate.
//
// This module is the low-level effective-settings holder. It deliberately does
// NOT import the three session stores (they import the getter below for their
// fallback — one direction, no cycle). The React entry point is
// usePlayerSettings(); PlayerSettingsBootstrap hydrates the holder once for the
// whole app, and PlayerSettingsView edits it.

import { useSyncExternalStore } from "react";

import type { LevelOption } from "@/lib/hls";
import {
  AUTO_QUALITY,
  heightOfQualityPreference,
  isAutoQuality,
  type QualitySelection,
} from "@/lib/quality-id";
import type { PlayerSettings } from "@/lib/api";

/**
 * The baked player defaults — identical to the pre-W1.6 behaviour (speed 1×,
 * autoplay on, quality Auto, captions off, theater off, card previews off).
 * Used for SSR, for signed-out users, and until a signed-in user's effective
 * settings hydrate. The server resolves a never-chosen preview preference from
 * the administrator's current default before returning it.
 */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  autoplay_next: true,
  default_speed: 1,
  default_quality: "auto",
  captions_default: false,
  theater_default: false,
  video_card_previews_enabled: false,
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
// Whether the per-user settings QUESTION has been answered at all this page
// load: false while the boot auth restore / the signed-in GET /me/player-
// settings is still in flight, true once the app bootstrap either hydrated a
// signed-in user's settings or reset for an anonymous visitor. Side-effectful seeds that
// must never beat a stored pref to the punch (W5 start-on-open) hold until
// this settles; a failed settings fetch deliberately never settles — better to
// keep click-to-play than to auto-start a user who may have said no.
let settled = false;

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

/** True once the per-user layer has RESOLVED this page load — hydrated for a
 * signed-in user, or reset for an anonymous one. While false, the per-user
 * answer is still unknown (auth restoring / settings fetch in flight), so
 * instance-seeded auto-behaviors must hold (see lib/player-autoplay
 * readStartOnOpen). */
export function arePlayerSettingsSettled(): boolean {
  return settled;
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
  settled = true;
  broadcast();
}

/**
 * Clear a previous account's settings while a newly authenticated account is
 * being loaded. Unlike resetPlayerSettings(), this leaves the question
 * unsettled: preview/autoplay features that require an explicit user answer
 * must remain off until the request succeeds.
 */
export function beginPlayerSettingsLoad(): void {
  current = DEFAULT_PLAYER_SETTINGS;
  hydrated = false;
  settled = false;
  broadcast();
}

/** resetPlayerSettings drops back to the baked defaults (on sign-out, or when
 * the visitor resolves as anonymous) so a signed-out session never inherits
 * the previous user's per-user defaults. Either way the per-user question is
 * now ANSWERED — "there is no per-user layer" — so this also settles. */
export function resetPlayerSettings(): void {
  current = DEFAULT_PLAYER_SETTINGS;
  hydrated = false;
  settled = true;
  broadcast();
}

/** Test-only: return to the pristine boot state (nothing hydrated, per-user
 * layer still UNRESOLVED) so tests can pin the pre-settlement behavior. */
export function unsettlePlayerSettingsForTests(): void {
  beginPlayerSettingsLoad();
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

// --- default-quality ⇄ quality-menu mapping ---------------------------------

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
 * matchQualityLevel maps a stored default_quality onto a selection for the
 * parsed quality menu.
 *
 * The stored preference is a HEIGHT ("720p") — that is its durable wire format
 * (`"auto"` or `^[0-9]{2,4}p$`, validated server-side in vidra-core
 * internal/playersettings), and it stays that way: a preference must outlive the
 * ladder it was chosen against, so it names the rung a user wants and nothing
 * finer. Matching is therefore a height match against the menu, which is already
 * built inside the codec family the engine is playing — so the result can never
 * name a rung outside that family.
 *
 * "auto" — or a rung this video doesn't offer (an unknown / unavailable height)
 * — maps to AUTO_QUALITY, so the player stays adaptive rather than forcing a
 * rung that doesn't exist.
 */
export function matchQualityLevel(
  defaultQuality: string,
  levels: LevelOption[],
): QualitySelection {
  const height = heightOfQualityPreference(defaultQuality);
  if (height === null) return AUTO_QUALITY;
  const match = levels.find((l) => !isAutoQuality(l.id) && l.id.height === height);
  return match ? match.id : AUTO_QUALITY;
}
