// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readStoredAutoplay,
  serverAutoplay,
  setAutoplay,
  subscribeAutoplay,
  toggleAutoplay,
} from "./player-autoplay";

afterEach(() => {
  window.sessionStorage.clear();
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
});
