// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readCollapsed,
  readDrawerOpen,
  readImmersive,
  serverCollapsed,
  serverDrawerOpen,
  serverImmersive,
  setCollapsed,
  setDrawerOpen,
  setImmersive,
  subscribeCollapsed,
  subscribeDrawerOpen,
  subscribeImmersive,
  toggleCollapsed,
  toggleDrawerOpen,
} from "./sidebar-state";

afterEach(() => {
  window.localStorage.clear();
  setImmersive(false);
  setDrawerOpen(false);
  vi.restoreAllMocks();
});

describe("sidebar collapse preference", () => {
  it("defaults to expanded (server snapshot and empty storage both read false)", () => {
    expect(serverCollapsed()).toBe(false);
    expect(readCollapsed()).toBe(false);
  });

  it("persists to localStorage under the historical key and reads it back", () => {
    setCollapsed(true);
    expect(window.localStorage.getItem("vidra.sidebar-collapsed")).toBe("1");
    expect(readCollapsed()).toBe(true);
    setCollapsed(false);
    expect(window.localStorage.getItem("vidra.sidebar-collapsed")).toBe("0");
    expect(readCollapsed()).toBe(false);
  });

  it("toggle flips the stored value", () => {
    toggleCollapsed();
    expect(readCollapsed()).toBe(true);
    toggleCollapsed();
    expect(readCollapsed()).toBe(false);
  });

  it("notifies subscribers on every write and stops after unsubscribe", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeCollapsed(onChange);
    setCollapsed(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    toggleCollapsed();
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    setCollapsed(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("survives storage being unavailable (private mode) by staying expanded", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readCollapsed()).toBe(false);
    expect(() => setCollapsed(true)).not.toThrow();
  });
});

describe("immersive + drawer flags", () => {
  it("default to off on the server and in a fresh client", () => {
    expect(serverImmersive()).toBe(false);
    expect(serverDrawerOpen()).toBe(false);
    expect(readImmersive()).toBe(false);
    expect(readDrawerOpen()).toBe(false);
  });

  it("are in-memory only — never written to storage", () => {
    setImmersive(true);
    setDrawerOpen(true);
    expect(readImmersive()).toBe(true);
    expect(readDrawerOpen()).toBe(true);
    expect(window.localStorage.getItem("vidra.sidebar-immersive")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("notify their own subscribers", () => {
    const onImmersive = vi.fn();
    const onDrawer = vi.fn();
    const stopImmersive = subscribeImmersive(onImmersive);
    const stopDrawer = subscribeDrawerOpen(onDrawer);
    setImmersive(true);
    expect(onImmersive).toHaveBeenCalled();
    toggleDrawerOpen();
    expect(readDrawerOpen()).toBe(true);
    expect(onDrawer).toHaveBeenCalled();
    stopImmersive();
    stopDrawer();
  });

  it("does not re-notify when the value is unchanged", () => {
    const onImmersive = vi.fn();
    const stop = subscribeImmersive(onImmersive);
    setImmersive(false);
    expect(onImmersive).not.toHaveBeenCalled();
    stop();
  });

  it("closes the drawer whenever immersive is turned off", () => {
    setImmersive(true);
    setDrawerOpen(true);
    expect(readDrawerOpen()).toBe(true);
    setImmersive(false);
    expect(readDrawerOpen()).toBe(false);
  });

  it("keeps the collapse preference independent of the drawer", () => {
    setCollapsed(true);
    setImmersive(true);
    setDrawerOpen(true);
    expect(readCollapsed()).toBe(true);
    setImmersive(false);
    expect(readCollapsed()).toBe(true);
  });
});
