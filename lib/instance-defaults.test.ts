// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getInstanceDefaultsSnapshot,
  primeInstanceDefaults,
  serverInstanceDefaults,
  setInstanceDefaultsForTests,
  subscribeInstanceDefaults,
} from "./instance-defaults";
import { getInstanceCached } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getInstanceCached: vi.fn(),
}));

const mockedGetInstance = vi.mocked(getInstanceCached);

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  setInstanceDefaultsForTests(null);
  vi.clearAllMocks();
});

describe("instance-defaults store", () => {
  it("starts null (no instance signal) on both server and client snapshots", () => {
    expect(serverInstanceDefaults()).toBeNull();
    expect(getInstanceDefaultsSnapshot()).toBeNull();
  });

  it("installs the defaults block from the shared instance fetch and notifies subscribers", async () => {
    mockedGetInstance.mockResolvedValue({
      defaults: { player_autoplay: false, feed_sort: "popular" },
    } as never);
    const onChange = vi.fn();
    const unsubscribe = subscribeInstanceDefaults(onChange);
    primeInstanceDefaults();
    await flush();
    expect(getInstanceDefaultsSnapshot()).toEqual({
      player_autoplay: false,
      feed_sort: "popular",
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    // Priming again is a no-op — one shared fetch per load.
    primeInstanceDefaults();
    expect(mockedGetInstance).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stays null on a failed fetch (hardcoded fallbacks apply) and can retry", async () => {
    mockedGetInstance.mockRejectedValueOnce(new Error("down"));
    primeInstanceDefaults();
    await flush();
    expect(getInstanceDefaultsSnapshot()).toBeNull();
    // The failure un-primes, so a later consumer retries.
    mockedGetInstance.mockResolvedValue({ defaults: { theme: "dark" } } as never);
    primeInstanceDefaults();
    await flush();
    expect(getInstanceDefaultsSnapshot()).toEqual({ theme: "dark" });
  });

  it("treats a payload without a defaults block as null (old backend)", async () => {
    mockedGetInstance.mockResolvedValue({ name: "vidra" } as never);
    primeInstanceDefaults();
    await flush();
    expect(getInstanceDefaultsSnapshot()).toBeNull();
  });
});
