// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The effective-policy hook layers a signed-in user's per-account override on top
// of the cached instance policy. Both inputs are mocked so the three resolution
// cases are exercised in isolation.
const mocks = vi.hoisted(() => ({
  getInstanceCached: vi.fn(),
  session: null as { user: { sensitive_content_policy?: string | null } | null } | null,
}));

vi.mock("@/lib/api", () => ({
  getInstanceCached: mocks.getInstanceCached,
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => mocks.session,
}));

import { useInstanceSensitivePolicy, useSensitiveContentPolicy } from "./use-sensitive-policy";

function resolveInstance(policy: string | null) {
  mocks.getInstanceCached.mockResolvedValue({ sensitive_content_policy: policy });
}

beforeEach(() => {
  mocks.session = null;
  resolveInstance("display");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useSensitiveContentPolicy — effective resolution", () => {
  it("a signed-in user's override beats the instance policy", async () => {
    mocks.session = { user: { sensitive_content_policy: "blur" } };
    resolveInstance("display");

    const { result } = renderHook(() => useSensitiveContentPolicy());
    // The override is available synchronously from the session.
    expect(result.current).toBe("blur");
    // …and stays put even after the (disagreeing) instance fetch resolves.
    await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalled());
    expect(result.current).toBe("blur");
  });

  it("a null/absent user override inherits the instance policy", async () => {
    mocks.session = { user: { sensitive_content_policy: null } };
    resolveInstance("warn");

    const { result } = renderHook(() => useSensitiveContentPolicy());
    await waitFor(() => expect(result.current).toBe("warn"));
  });

  it("a signed-out viewer gets the instance policy", async () => {
    mocks.session = null;
    resolveInstance("display");

    const { result } = renderHook(() => useSensitiveContentPolicy());
    await waitFor(() => expect(result.current).toBe("display"));
  });

  it("starts null (SSR/hydration-safe) before either input settles", () => {
    mocks.session = null;
    // A never-resolving instance fetch models the first render.
    mocks.getInstanceCached.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSensitiveContentPolicy());
    expect(result.current).toBeNull();
  });
});

describe("useInstanceSensitivePolicy — instance only", () => {
  it("ignores the user override and returns just the instance policy", async () => {
    mocks.session = { user: { sensitive_content_policy: "hide" } };
    resolveInstance("warn");

    const { result } = renderHook(() => useInstanceSensitivePolicy());
    await waitFor(() => expect(result.current).toBe("warn"));
  });
});
