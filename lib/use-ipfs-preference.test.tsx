// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlaybackSessionState } from "./playback-session";
import { useIPFSPreference } from "./use-ipfs-preference";

const pending: PlaybackSessionState = { status: "pending", session: null };
const ready: PlaybackSessionState = { status: "ready", session: {
  session_id: "session", video_id: "one", hls_url: "/authoritative.m3u8",
  authoritative_hls_url: "/authoritative.m3u8", ipfs_hls_url: "https://gateway.test/ipfs/cid/hashed-master.m3u8",
} };
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("waits briefly for a hinted mirror and uses the server-authored master filename", () => {
  const { result, rerender } = renderHook(({ session }) => useIPFSPreference("one", true, true, session), { initialProps: { session: pending } });
  expect(result.current.waiting).toBe(true);
  rerender({ session: ready });
  expect(result.current.url).toBe(ready.session!.ipfs_hls_url);
  expect(result.current.waiting).toBe(false);
});

it("starts CDN after 500ms and never flips it when a late session advertises IPFS", () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ session }) => useIPFSPreference("one", true, true, session), { initialProps: { session: pending } });
  act(() => { vi.advanceTimersByTime(499); });
  expect(result.current.waiting).toBe(true);
  act(() => { vi.advanceTimersByTime(1); });
  expect(result.current.waiting).toBe(false);
  expect(result.current.url).toBeNull();
  rerender({ session: ready });
  expect(result.current.url).toBeNull();
  expect(result.current.available).toBe(ready.session!.ipfs_hls_url);
});

it.each([[true, false], [false, true]])("does not hold playback when enabled=%s and hint=%s", (enabled, hint) => {
  const { result, rerender } = renderHook(({ session }) => useIPFSPreference("one", enabled, hint, session), { initialProps: { session: pending } });
  expect(result.current.waiting).toBe(false);
  rerender({ session: ready });
  expect(result.current.url).toBeNull();
});

it("treats a healthy session without an eligible IPFS URL as authoritative", () => {
  const { result } = renderHook(() => useIPFSPreference("one", true, true, { ...ready, session: { ...ready.session!, ipfs_hls_url: undefined } }));
  expect(result.current.waiting).toBe(false);
  expect(result.current.url).toBeNull();
  expect(result.current.available).toBeNull();
});

it("honors explicit source choice and resets it on navigation", () => {
  const { result, rerender } = renderHook(({ id, session }) => useIPFSPreference(id, true, true, session), { initialProps: { id: "one", session: ready } });
  act(() => result.current.select("server"));
  expect(result.current.url).toBeNull();
  act(() => result.current.select("ipfs"));
  expect(result.current.url).toBe(ready.session!.ipfs_hls_url);
  rerender({ id: "two", session: pending });
  expect(result.current.waiting).toBe(true);
  expect(result.current.available).toBeNull();
});
