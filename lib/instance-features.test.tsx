// @vitest-environment jsdom

import { waitFor } from "@testing-library/react";
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
} from "./instance-features";

beforeEach(() => {
  setInstanceFeaturesForTests(null);
  mocks.getInstanceCached.mockReset();
  mocks.invalidateInstanceCache.mockReset();
});

afterEach(() => {
  setInstanceFeaturesForTests(null);
  vi.restoreAllMocks();
});

describe("instance feature refresh", () => {
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
    let resolveOld: (value: { features: { video_card_previews: boolean } }) => void = () => {
      throw new Error("old feature request was not started");
    };
    mocks.getInstanceCached
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ features: { video_card_previews: false } });

    primeInstanceFeatures();
    refreshInstanceFeatures();
    await waitFor(() =>
      expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(false),
    );

    resolveOld({ features: { video_card_previews: true } });
    await Promise.resolve();
    expect(getInstanceFeaturesSnapshot()?.video_card_previews).toBe(false);
  });
});
