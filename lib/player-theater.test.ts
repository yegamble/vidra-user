// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readStoredTheater,
  serverTheater,
  setTheater,
  subscribeTheater,
  toggleTheater,
} from "./player-theater";
import {
  DEFAULT_PLAYER_SETTINGS,
  hydratePlayerSettings,
  resetPlayerSettings,
} from "./player-settings";

afterEach(() => {
  window.sessionStorage.clear();
  resetPlayerSettings();
  vi.restoreAllMocks();
});

describe("player-theater store", () => {
  it("defaults to off (server snapshot and empty storage both read false)", () => {
    expect(serverTheater()).toBe(false);
    expect(readStoredTheater()).toBe(false);
  });

  it("persists the mode to sessionStorage and reads it back", () => {
    setTheater(true);
    expect(window.sessionStorage.getItem("vidra.theater")).toBe("1");
    expect(readStoredTheater()).toBe(true);
    setTheater(false);
    expect(window.sessionStorage.getItem("vidra.theater")).toBe("0");
    expect(readStoredTheater()).toBe(false);
  });

  it("toggle flips the current stored value", () => {
    expect(readStoredTheater()).toBe(false);
    toggleTheater();
    expect(readStoredTheater()).toBe(true);
    toggleTheater();
    expect(readStoredTheater()).toBe(false);
  });

  it("treats a corrupt or unexpected stored value as off", () => {
    window.sessionStorage.setItem("vidra.theater", "yes");
    expect(readStoredTheater()).toBe(false);
    window.sessionStorage.setItem("vidra.theater", "true");
    expect(readStoredTheater()).toBe(false);
  });

  it("falls back to the hydrated per-user theater_default when no session value is stored", () => {
    hydratePlayerSettings({ ...DEFAULT_PLAYER_SETTINGS, theater_default: true });
    expect(readStoredTheater()).toBe(true);
    // an explicit in-session choice still wins over the per-user default
    setTheater(false);
    expect(readStoredTheater()).toBe(false);
  });

  it("broadcasts a change to subscribers when the mode is written", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeTheater(onChange);
    setTheater(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    toggleTheater();
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    setTheater(false);
    expect(onChange).toHaveBeenCalledTimes(2); // no longer notified after unsubscribe
  });
});
