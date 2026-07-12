// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { setInstanceDefaultsForTests } from "./instance-defaults";
import {
  readStartOnOpen,
  readStoredAutoplay,
  serverAutoplay,
  serverStartOnOpen,
  setAutoplay,
  subscribeAutoplay,
  toggleAutoplay,
} from "./player-autoplay";
import {
  DEFAULT_PLAYER_SETTINGS,
  hydratePlayerSettings,
  resetPlayerSettings,
  unsettlePlayerSettingsForTests,
} from "./player-settings";

afterEach(() => {
  window.sessionStorage.clear();
  // Pristine boot state: nothing hydrated AND the per-user layer unresolved
  // (resetPlayerSettings would settle it, hiding the pre-settlement holds).
  unsettlePlayerSettingsForTests();
  setInstanceDefaultsForTests(null);
  vi.restoreAllMocks();
});

describe("player-autoplay store", () => {
  it("defaults to ON (server snapshot and empty storage both read true)", () => {
    expect(serverAutoplay()).toBe(true);
    expect(readStoredAutoplay()).toBe(true);
  });

  it("persists the preference to sessionStorage and reads it back", () => {
    setAutoplay(false);
    expect(window.sessionStorage.getItem("vidra.autoplay-next")).toBe("0");
    expect(readStoredAutoplay()).toBe(false);
    setAutoplay(true);
    expect(window.sessionStorage.getItem("vidra.autoplay-next")).toBe("1");
    expect(readStoredAutoplay()).toBe(true);
  });

  it("toggle flips the current stored value (from the ON default)", () => {
    expect(readStoredAutoplay()).toBe(true);
    toggleAutoplay();
    expect(readStoredAutoplay()).toBe(false);
    toggleAutoplay();
    expect(readStoredAutoplay()).toBe(true);
  });

  it("treats only the explicit off marker as off; a corrupt value stays ON", () => {
    window.sessionStorage.setItem("vidra.autoplay-next", "0");
    expect(readStoredAutoplay()).toBe(false);
    window.sessionStorage.setItem("vidra.autoplay-next", "nope");
    expect(readStoredAutoplay()).toBe(true);
    window.sessionStorage.setItem("vidra.autoplay-next", "true");
    expect(readStoredAutoplay()).toBe(true);
  });

  it("falls back to the hydrated per-user autoplay_next when no session value is stored", () => {
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: false });
    expect(readStoredAutoplay()).toBe(false);
    // an explicit in-session choice still wins over the per-user default
    setAutoplay(true);
    expect(readStoredAutoplay()).toBe(true);
  });

  it("seeds the anonymous/unset fallback from the instance default (W5)", () => {
    // No session choice, no per-user settings: the operator default applies.
    setInstanceDefaultsForTests({ player_autoplay: false });
    expect(readStoredAutoplay()).toBe(false);
    setInstanceDefaultsForTests({ player_autoplay: true });
    expect(readStoredAutoplay()).toBe(true);
    // A defaults block without the key keeps the baked ON default.
    setInstanceDefaultsForTests({});
    expect(readStoredAutoplay()).toBe(true);
  });

  it("never lets the instance default override an explicit preference", () => {
    setInstanceDefaultsForTests({ player_autoplay: true });
    // The signed-in user's stored pref (migration 0075) wins over the seed…
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: false });
    expect(readStoredAutoplay()).toBe(false);
    // …and an in-session choice wins over everything.
    setAutoplay(true);
    expect(readStoredAutoplay()).toBe(true);
    // Sign-out drops back to the instance seed, not the user's old pref.
    window.sessionStorage.clear();
    resetPlayerSettings();
    setInstanceDefaultsForTests({ player_autoplay: false });
    expect(readStoredAutoplay()).toBe(false);
  });

  it("broadcasts a change to subscribers when the preference is written", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAutoplay(onChange);
    setAutoplay(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    toggleAutoplay();
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    setAutoplay(true);
    expect(onChange).toHaveBeenCalledTimes(2); // no longer notified after unsubscribe
  });

  it("notifies subscribers when the instance defaults land", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeAutoplay(onChange);
    setInstanceDefaultsForTests({ player_autoplay: false });
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("start-on-open (W5)", () => {
  it("stays off without an instance signal — today's exact behavior", () => {
    resetPlayerSettings(); // anonymous visitor, per-user layer resolved
    expect(serverStartOnOpen()).toBe(false);
    expect(readStartOnOpen()).toBe(false);
    // Even a defaults block without the key means "not seeded".
    setInstanceDefaultsForTests({});
    expect(readStartOnOpen()).toBe(false);
  });

  it("follows the instance seed once the per-user layer has resolved", () => {
    resetPlayerSettings(); // anonymous visitor, per-user layer resolved
    setInstanceDefaultsForTests({ player_autoplay: true });
    expect(readStartOnOpen()).toBe(true);
    setInstanceDefaultsForTests({ player_autoplay: false });
    expect(readStartOnOpen()).toBe(false);
  });

  it("holds the seed until the per-user settings resolve (feed→watch hydration race)", () => {
    // The feed page already primed the instance defaults, but the signed-in
    // user's server-backed autoplay_next (migration 0075) is still in flight:
    // the seed alone must NOT start playback…
    setInstanceDefaultsForTests({ player_autoplay: true });
    expect(readStartOnOpen()).toBe(false);
    // …and when the stored pref lands as OFF, it stays off — the user's
    // explicit choice was never raced.
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: false });
    expect(readStartOnOpen()).toBe(false);
  });

  it("releases the hold once settings resolve in favor — or as anonymous", () => {
    setInstanceDefaultsForTests({ player_autoplay: true });
    expect(readStartOnOpen()).toBe(false); // unresolved: held
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: true });
    expect(readStartOnOpen()).toBe(true); // signed-in, autoplay on
    unsettlePlayerSettingsForTests();
    expect(readStartOnOpen()).toBe(false); // fresh load: held again
    resetPlayerSettings(); // resolves as anonymous → the seed applies
    expect(readStartOnOpen()).toBe(true);
  });

  it("an explicit session choice does not wait for settlement", () => {
    // The end card's switch is the strongest layer — it can't be raced.
    setInstanceDefaultsForTests({ player_autoplay: false });
    setAutoplay(true);
    expect(readStartOnOpen()).toBe(true);
    setAutoplay(false);
    expect(readStartOnOpen()).toBe(false);
  });

  it("lets explicit user preferences beat the seed in both directions", () => {
    setInstanceDefaultsForTests({ player_autoplay: true });
    setAutoplay(false); // in-session choice
    expect(readStartOnOpen()).toBe(false);
    window.sessionStorage.clear();
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, autoplay_next: false });
    expect(readStartOnOpen()).toBe(false);
    resetPlayerSettings();
    setInstanceDefaultsForTests({ player_autoplay: false });
    setAutoplay(true);
    expect(readStartOnOpen()).toBe(true);
  });
});
