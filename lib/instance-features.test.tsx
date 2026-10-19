// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstanceCached: vi.fn(),
  invalidateInstanceCache: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getInstanceCached: mocks.getInstanceCached,
  invalidateInstanceCache: mocks.invalidateInstanceCache,
}));

import {
  getInstanceFeaturesSnapshot,
  primeInstanceFeatures,
  refreshInstanceFeatures,
  setInstanceFeaturesForTests,
  useInstanceBroadcast,
} from "./instance-features";

beforeEach(() => {
  setInstanceFeaturesForTests(null);
  mocks.getInstanceCached.mockReset();
  mocks.invalidateInstanceCache.mockReset();
});

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
  vi.restoreAllMocks();
});

describe("instance feature refresh", () => {
  it("shares a stable broadcast snapshot and retains it while refresh is pending", async () => {
    const broadcast = { enabled: true, message: "Current announcement", level: "info", dismissable: false };
    mocks.getInstanceCached.mockResolvedValueOnce({ features: {}, broadcast });
    const { result, rerender } = renderHook(() => useInstanceBroadcast());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.broadcast).toEqual(broadcast));
    const snapshot = result.current;
    rerender();
    expect(result.current).toBe(snapshot);
    expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1);

    let finish!: (value: unknown) => void;
    mocks.getInstanceCached.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => refreshInstanceFeatures());
    expect(result.current).toBe(snapshot);
    await act(async () => { finish({ features: {}, broadcast: { ...broadcast, enabled: false } }); });
    expect(result.current?.broadcast.enabled).toBe(false);
    expect(result.current).not.toBe(snapshot);
    act(() => setInstanceFeaturesForTests(null));
    expect(result.current).toBeNull();
    expect(mocks.getInstanceCached).toHaveBeenCalledTimes(2);
  });

  it("fails closed after an admin save and replaces the stale cached gate", async () => {
    mocks.getInstanceCached
      .mockResolvedValueOnce({ features: { video_card_previews: true } })
      .mockResolvedValueOnce({ features: { video_card_previews: false } });

    primeInstanceFeatures();
    await waitFor(() =>
      expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(true),
    );

    refreshInstanceFeatures();
    expect(mocks.invalidateInstanceCache).toHaveBeenCalledTimes(1);
    expect(getInstanceFeaturesSnapshot()).toBeNull();
    await waitFor(() =>
      expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(false),
    );
  });

  it("ignores an older in-flight snapshot that resolves after the refresh", async () => {
    let resolveOld: (value: { features: { video_card_previews: boolean }; broadcast: { message: string } }) => void = () => {
      throw new Error("old feature request was not started");
    };
    mocks.getInstanceCached
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ features: { video_card_previews: false }, broadcast: { message: "New announcement" } });

    const { result } = renderHook(() => useInstanceBroadcast());
    primeInstanceFeatures();
    refreshInstanceFeatures();
    await waitFor(() =>
      expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(false),
    );

    await act(async () => { resolveOld({ features: { video_card_previews: true }, broadcast: { message: "Stale announcement" } }); });
    expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(false);
    expect(result.current?.broadcast.message).toBe("New announcement");
  });
});
