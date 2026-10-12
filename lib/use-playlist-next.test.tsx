// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), session: { settled: true, authed: true, viewerId: "owner", viewerKey: "authed:owner" } }));
vi.mock("@/lib/api", () => ({ api: { getPlaylist: mocks.get } }));
vi.mock("@/lib/use-settled-session", () => ({ useSettledSession: () => mocks.session }));
import type { Video } from "@/lib/api";
import { usePlaylistNext } from "./use-playlist-next";

// 25 items, so the default page (20) ends at item 20 and item 21 is unloaded.
const all = Array.from({ length: 25 }, (_, i) => ({ id: `v${i + 1}`, title: `V${i + 1}` })) as Video[];
const vid = (n: number) => all[n - 1];
const serve = () =>
  mocks.get.mockImplementation((_id: string, w: { limit?: number; offset?: number } = {}) =>
    Promise.resolve({ title: "Mix", owner_id: "owner", visibility: "private", total: 25, videos: all.slice(w.offset ?? 0, (w.offset ?? 0) + (w.limit ?? 20)) }),
  );
const at = (n: number, extra = "") => window.history.replaceState(null, "", `/videos/v${n}?playlist=p1&index=${n}${extra}`);

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.get.mockReset();
  serve();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

it("advances across a page boundary by fetching the unloaded item by offset", async () => {
  at(20);
  const { result } = renderHook(() => usePlaylistNext(vid(20)));
  await waitFor(() => expect(result.current.next?.id).toBe("v21"));
  expect(mocks.get).toHaveBeenCalledWith("p1", { limit: 1, offset: 20 }, expect.anything());
  expect(result.current.href).toBe("/videos/v21?playlist=p1&index=21");
});

it("ends at the last item, and loops back to the first when loop is on", async () => {
  at(25);
  const { result } = renderHook(() => usePlaylistNext(vid(25)));
  await waitFor(() => expect(result.current.pos).toBe(24));
  expect(result.current.next).toBeNull();
  act(() => result.current.setLoop(true));
  await waitFor(() => expect(result.current.next?.id).toBe("v1"));
  expect(result.current.href).toBe("/videos/v1?playlist=p1&index=1&loop=1");
  expect(window.location.search).toContain("loop=1");
});

it("locates a bare ?playlist= link by id, paging forward to find it", async () => {
  window.history.replaceState(null, "", "/videos/v23?playlist=p1");
  const { result } = renderHook(() => usePlaylistNext(vid(23)));
  await waitFor(() => expect(result.current.next?.id).toBe("v24"));
  expect(result.current.pos).toBe(22);
});

it("shuffle plays every item once before repeating", async () => {
  at(1, "&shuffle=1");
  const seen = new Set(["v1"]);
  let current = vid(1);
  for (let i = 0; i < 24; i++) {
    const { result, unmount } = renderHook(() => usePlaylistNext(current));
    await waitFor(() => expect(result.current.next).not.toBeNull());
    expect(seen.has(result.current.next!.id)).toBe(false);
    seen.add(result.current.next!.id);
    current = result.current.next!;
    window.history.replaceState(null, "", result.current.href!);
    unmount();
  }
  expect(seen.size).toBe(25);
});

it("surfaces a load failure as an error and recovers on retry", async () => {
  at(1);
  mocks.get.mockRejectedValueOnce(new Error("denied"));
  const { result } = renderHook(() => usePlaylistNext(vid(1)));
  await waitFor(() => expect(result.current.status).toBe("error"));
  expect(result.current.next).toBeNull();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.next?.id).toBe("v2"));
});

it("is inert without a playlist param", async () => {
  window.history.replaceState(null, "", "/videos/v1");
  const { result } = renderHook(() => usePlaylistNext(vid(1)));
  expect(result.current.active).toBe(false);
  expect(result.current.next).toBeNull();
  expect(mocks.get).not.toHaveBeenCalled();
});
