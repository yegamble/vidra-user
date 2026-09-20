// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { toggleAmbientMode, useAmbientMode } from "./player-ambient";

const KEY = "vidra.player.ambient";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // A successful write releases any in-memory override left by blocked storage.
  toggleAmbientMode();
  sessionStorage.clear();
});

it("keeps the player switch and ambient surface in sync for the session", () => {
  const player = renderHook(() => useAmbientMode());
  const surface = renderHook(() => useAmbientMode());
  expect(player.result.current).toBe(true);
  act(() => toggleAmbientMode());
  expect(player.result.current).toBe(false);
  expect(surface.result.current).toBe(false);
  expect(sessionStorage.getItem(KEY)).toBe("0");
  act(() => toggleAmbientMode());
  expect(surface.result.current).toBe(true);
});

it("honors the current toggle when storage is readable but rejects writes", () => {
  sessionStorage.setItem(KEY, "1");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
  const { result } = renderHook(() => useAmbientMode());
  act(() => toggleAmbientMode());
  expect(result.current).toBe(false);
  act(() => toggleAmbientMode());
  expect(result.current).toBe(true);
});

it("restores the default after the stored session preference is cleared", () => {
  sessionStorage.setItem(KEY, "1");
  const { result } = renderHook(() => useAmbientMode());
  act(() => toggleAmbientMode());
  expect(result.current).toBe(false);
  act(() => {
    sessionStorage.clear();
    window.dispatchEvent(new Event("storage"));
  });
  expect(result.current).toBe(true);
});
