// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSettledOptionalSession, useSettledSession } from "@/lib/use-settled-session";

type FakeSession = { status: string; user?: { id: string } | null };

let session: FakeSession = { status: "restoring" };
// `optionalSession` doubles as the "no provider" switch: null is exactly what
// useOptionalSession returns outside an AuthProvider.
let optionalSession: FakeSession | null = { status: "anon", user: null };
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => session,
  useOptionalSession: () => optionalSession,
}));

/** Renders children with no session in context at all. */
function NoProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("useSettledSession", () => {
  it("reports NOT settled while the boot-time refresh is in flight", () => {
    session = { status: "restoring", user: null };
    const { result } = renderHook(() => useSettledSession());
    expect(result.current.settled).toBe(false);
    expect(result.current.authed).toBe(false);
    expect(result.current.viewerId).toBeNull();
  });

  it("reports settled for an anonymous visitor", () => {
    session = { status: "anon", user: null };
    const { result } = renderHook(() => useSettledSession());
    expect(result.current.settled).toBe(true);
    expect(result.current.authed).toBe(false);
    expect(result.current.viewerId).toBeNull();
  });

  it("reports settled with the viewer's id once signed in", () => {
    session = { status: "authed", user: { id: "u-1" } };
    const { result } = renderHook(() => useSettledSession());
    expect(result.current.settled).toBe(true);
    expect(result.current.authed).toBe(true);
    expect(result.current.viewerId).toBe("u-1");
  });

  it("keys a restoring viewer as anonymous, so a server-rendered seed is not thrown away", () => {
    // The seed was fetched with no viewer, so it IS the anonymous answer. A
    // third "restoring" key would retire it on every load, for everybody.
    session = { status: "restoring", user: null };
    const restoring = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "anon", user: null };
    const anon = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "authed", user: { id: "u-1" } };
    const authed = renderHook(() => useSettledSession()).result.current.viewerKey;
    expect(restoring).toBe(anon);
    expect(authed).not.toBe(anon);
  });

  it("changes the key when the identity changes, so a viewer-scoped effect re-runs", () => {
    session = { status: "authed", user: { id: "u-1" } };
    const first = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "authed", user: { id: "u-2" } };
    const second = renderHook(() => useSettledSession()).result.current.viewerKey;
    expect(second).not.toBe(first);
  });

  it("keeps the key stable across a profile edit that does not change identity", () => {
    session = { status: "authed", user: { id: "u-1" } };
    const { result, rerender } = renderHook(() => useSettledSession());
    const first = result.current.viewerKey;
    session = { status: "authed", user: { id: "u-1" } };
    rerender();
    expect(result.current.viewerKey).toBe(first);
  });

  it("still distinguishes signed-in from anonymous when the session carries no user object", () => {
    // Component tests mock the session as `{ status }` alone; the key must not
    // collapse an authed viewer onto the anonymous one.
    session = { status: "authed" };
    const authed = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "anon" };
    const anon = renderHook(() => useSettledSession()).result.current.viewerKey;
    expect(authed).not.toBe(anon);
  });
});

describe("useSettledOptionalSession", () => {
  it("treats the absence of a provider as a settled anonymous viewer", () => {
    // Mirrors useOptionalSession: for a component that also renders bare, "no
    // session" is a valid answer, not a programming error — and a read with no
    // provider above it can never be delayed into one.
    optionalSession = null;
    const { result } = renderHook(() => useSettledOptionalSession(), {
      wrapper: NoProvider,
    });
    expect(result.current.settled).toBe(true);
    expect(result.current.authed).toBe(false);
    expect(result.current.viewerKey).toBe("anon");
  });

  it("waits for the session when a provider IS above it", () => {
    optionalSession = { status: "restoring", user: null };
    const { result } = renderHook(() => useSettledOptionalSession());
    expect(result.current.settled).toBe(false);
  });

  it("carries the viewer's identity once signed in", () => {
    optionalSession = { status: "authed", user: { id: "u-9" } };
    const { result } = renderHook(() => useSettledOptionalSession());
    expect(result.current.settled).toBe(true);
    expect(result.current.viewerId).toBe("u-9");
  });
});
