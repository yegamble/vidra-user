// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), session: { status: "authed", user: { id: "owner" } } }));
vi.mock("@/lib/api", () => ({ api: { getPlaylist: mocks.get } }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));
import { usePlaylistNext } from "./use-playlist-next";
const videos = [{ id: "first", title: "First" }, { id: "other", title: "Other" }, { id: "last", title: "Last" }];
beforeEach(() => { window.history.replaceState(null, "", "/videos/first?playlist=p1"); mocks.get.mockReset().mockResolvedValue({ videos }); mocks.session = { status: "authed", user: { id: "owner" } }; });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });
it("reads stored order and retains context for the next item", async () => {
 const { result } = renderHook(() => usePlaylistNext("first"));
 await waitFor(() => expect(result.current.next?.id).toBe("other"));
 expect(result.current.href).toContain("?playlist=p1");
});
it("ends the playlist and does not select a different item for a removed video", async () => {
 const { result, rerender } = renderHook(({ id }) => usePlaylistNext(id), { initialProps: { id: "last" } });
 await waitFor(() => expect(result.current.status).toBe("ready"));
 expect(result.current.next).toBeNull();rerender({ id: "missing" });expect(result.current.next).toBeNull();
});
it("waits for restoration and clears order when identity changes", async () => {
 mocks.session.status = "restoring";const { result, rerender } = renderHook(() => usePlaylistNext("first"));
 expect(mocks.get).not.toHaveBeenCalled();mocks.session.status = "authed";rerender();
 await waitFor(() => expect(result.current.next?.id).toBe("other"));
 mocks.get.mockRejectedValue(new Error("denied"));mocks.session.user = { id: "other" };rerender();
 expect(result.current.next).toBeNull();await waitFor(() => expect(result.current.status).toBe("error"));
});
it("retries errors without inventing a next video", async () => {
 mocks.get.mockRejectedValueOnce(new Error("offline"));const { result } = renderHook(() => usePlaylistNext("first"));
 await waitFor(() => expect(result.current.status).toBe("error"));expect(result.current.next).toBeNull();
 act(() => result.current.retry());await waitFor(() => expect(result.current.next?.id).toBe("other"));
});
