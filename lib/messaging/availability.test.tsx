// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The store reaches for the shared instance fetch on prime; every case here
// injects a snapshot instead, so these must exist but are never called.
vi.mock("@/lib/api", () => ({
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { useMessagingAvailable } from "./availability";

// A features document shaped like the real one, narrowed to what the gate reads.
function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

afterEach(() => {
  setInstanceFeaturesForTests(null);
});

describe("useMessagingAvailable", () => {
  it("closes the gate when the instance discloses messaging: false", () => {
    setInstanceFeaturesForTests(features({ messaging: false }));
    expect(renderHook(() => useMessagingAvailable()).result.current).toBe(false);
  });

  // The counter-tests. An over-broad gate that hid messaging from instances
  // which never turned it off would be worse than the 403 it prevents.
  it("keeps the gate open when the instance discloses messaging: true", () => {
    setInstanceFeaturesForTests(features({ messaging: true }));
    expect(renderHook(() => useMessagingAvailable()).result.current).toBe(true);
  });

  it("keeps the gate open when the field is absent (a core that predates it)", () => {
    setInstanceFeaturesForTests(features());
    expect(renderHook(() => useMessagingAvailable()).result.current).toBe(true);
  });

  it("keeps the gate open while the instance document is still unknown", () => {
    setInstanceFeaturesForTests(null);
    expect(renderHook(() => useMessagingAvailable()).result.current).toBe(true);
  });
});
