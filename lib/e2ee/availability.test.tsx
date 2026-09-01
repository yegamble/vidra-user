// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Two things are asserted through this mock: the store's own dependencies
// exist, and `api` is NOT reached for an availability answer — the old
// implementation spent a GET /api/v1/e2ee/devices per session to learn what the
// instance document already carries.
const { listMyE2EEDevices } = vi.hoisted(() => ({ listMyE2EEDevices: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { listMyE2EEDevices },
  ApiError: class ApiError extends Error {
    status = 0;
  },
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { useE2EEAvailable } from "./availability";

function features(overrides: Record<string, unknown> = {}) {
  return { uploads: true, comments: true, ...overrides } as never;
}

afterEach(() => {
  setInstanceFeaturesForTests(null);
  listMyE2EEDevices.mockReset();
});

describe("useE2EEAvailable", () => {
  it("is unavailable when the instance discloses messaging_e2ee: false, without a probe", () => {
    setInstanceFeaturesForTests(features({ messaging: true, messaging_e2ee: false }));
    expect(renderHook(() => useE2EEAvailable(true)).result.current).toBe(false);
    expect(listMyE2EEDevices).not.toHaveBeenCalled();
  });

  // The counter-tests: an instance that never turned E2EE off, and a core old
  // enough not to disclose the field at all, both keep today's behaviour.
  it("is available when the instance discloses messaging_e2ee: true", () => {
    setInstanceFeaturesForTests(features({ messaging: true, messaging_e2ee: true }));
    expect(renderHook(() => useE2EEAvailable(true)).result.current).toBe(true);
    expect(listMyE2EEDevices).not.toHaveBeenCalled();
  });

  it("is available when the field is absent (a core that predates the disclosure)", () => {
    setInstanceFeaturesForTests(features());
    expect(renderHook(() => useE2EEAvailable(true)).result.current).toBe(true);
  });

  // Tri-state preserved: callers render the affordance only on an explicit
  // `true`, so "not known yet" must stay distinct from "not available" — that is
  // what keeps the encrypted option from flashing on and then vanishing.
  it("answers null while the instance document is still unknown", () => {
    setInstanceFeaturesForTests(null);
    expect(renderHook(() => useE2EEAvailable(true)).result.current).toBeNull();
  });

  it("answers false, never null, for a caller that opted out", () => {
    setInstanceFeaturesForTests(null);
    expect(renderHook(() => useE2EEAvailable(false)).result.current).toBe(false);
  });

  // A logged-out visitor is a case the probe could not answer at all: it needed
  // auth, so a 401 was indistinguishable from "the operator turned E2EE off".
  it("answers from the public document with no session at all", () => {
    setInstanceFeaturesForTests(features({ messaging: true, messaging_e2ee: false }));
    expect(renderHook(() => useE2EEAvailable(true)).result.current).toBe(false);
    expect(listMyE2EEDevices).not.toHaveBeenCalled();
  });
});
