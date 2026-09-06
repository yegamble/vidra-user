// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSettledSession } from "@/lib/use-settled-session";

let session: { status: string; user?: { id: string } | null } = { status: "restoring" };
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session }));

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

  it("gives restoring, anonymous and signed-in viewers three different keys", () => {
    session = { status: "restoring", user: null };
    const restoring = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "anon", user: null };
    const anon = renderHook(() => useSettledSession()).result.current.viewerKey;
    session = { status: "authed", user: { id: "u-1" } };
    const authed = renderHook(() => useSettledSession()).result.current.viewerKey;
    expect(new Set([restoring, anon, authed]).size).toBe(3);
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
