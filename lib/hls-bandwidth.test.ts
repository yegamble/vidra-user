import { describe, expect, it, vi } from "vitest";

import {
  HLS_ABR_DEFAULT_ESTIMATE,
  HLS_BANDWIDTH_MAX_AGE_MS,
  HLS_BANDWIDTH_STORAGE_KEY,
  autoHeightCapForNetwork,
  readStoredBandwidthEstimate,
  shouldConserveData,
  storeBandwidthEstimate,
} from "./hls-bandwidth";
import { levelIndexForHeightCap } from "./hls";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("HLS bandwidth estimate persistence", () => {
  it("round-trips a recent, bounded estimate", () => {
    const storage = memoryStorage();
    storeBandwidthEstimate(8_250_000.4, storage, 1_000);

    expect(storage.setItem).toHaveBeenCalledWith(
      HLS_BANDWIDTH_STORAGE_KEY,
      JSON.stringify({ bitsPerSecond: 8_250_000, measuredAt: 1_000 }),
    );
    expect(readStoredBandwidthEstimate(storage, 2_000)).toBe(8_250_000);
  });

  it("falls back to the balanced seed for stale or malformed data", () => {
    const storage = memoryStorage();
    storage.setItem(
      HLS_BANDWIDTH_STORAGE_KEY,
      JSON.stringify({ bitsPerSecond: 9_000_000, measuredAt: 1_000 }),
    );
    expect(readStoredBandwidthEstimate(storage, 1_000 + HLS_BANDWIDTH_MAX_AGE_MS + 1)).toBe(
      HLS_ABR_DEFAULT_ESTIMATE,
    );

    storage.setItem(HLS_BANDWIDTH_STORAGE_KEY, "not-json");
    expect(readStoredBandwidthEstimate(storage, 2_000)).toBe(HLS_ABR_DEFAULT_ESTIMATE);
  });
});

describe("metered-network policy", () => {
  const levels = [{ height: 1080 }, { height: 360 }, { height: 720 }, { height: 480 }];
  // The policy states a HEIGHT; the engine adapter translates it into whatever
  // handle that engine caps with (for hls.js, a level index).
  const capIndex = (connection?: Parameters<typeof autoHeightCapForNetwork>[0]) => {
    const height = autoHeightCapForNetwork(connection);
    return height === null ? null : levelIndexForHeightCap(levels, height);
  };

  it("caps Save-Data/2G at 480p — the highest 480p-or-lower rung", () => {
    expect(autoHeightCapForNetwork({ saveData: true, effectiveType: "4g" })).toBe(480);
    expect(autoHeightCapForNetwork({ effectiveType: "2g" })).toBe(480);
    expect(autoHeightCapForNetwork({ effectiveType: "slow-2g" })).toBe(480);
    expect(capIndex({ saveData: true, effectiveType: "4g" })).toBe(3);
    expect(capIndex({ effectiveType: "2g" })).toBe(3);
  });

  it("caps 3G at 720p and leaves unconstrained networks uncapped", () => {
    expect(autoHeightCapForNetwork({ effectiveType: "3g" })).toBe(720);
    expect(capIndex({ effectiveType: "3g" })).toBe(2);
    expect(autoHeightCapForNetwork({ effectiveType: "4g" })).toBeNull();
    expect(autoHeightCapForNetwork()).toBeNull();
    expect(capIndex({ effectiveType: "4g" })).toBeNull();
    expect(capIndex()).toBeNull();
  });

  it("suppresses optional media on every constrained signal", () => {
    expect(shouldConserveData({ saveData: true })).toBe(true);
    expect(shouldConserveData({ effectiveType: "slow-2g" })).toBe(true);
    expect(shouldConserveData({ effectiveType: "3g" })).toBe(true);
    expect(shouldConserveData({ effectiveType: "4g" })).toBe(false);
  });
});
