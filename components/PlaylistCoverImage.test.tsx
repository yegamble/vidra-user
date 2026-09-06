// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), session: { status: "authed", user: { id: "owner" } } }));
vi.mock("@/lib/api", () => ({ api: { fetchPlaylistThumbnail: mocks.fetch } }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));
import { PlaylistCoverImage } from "./PlaylistCoverImage";
beforeEach(() => {
  mocks.session = { status: "authed", user: { id: "owner" } };
  mocks.fetch.mockReset().mockResolvedValue(new Blob(["image"]));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:cover") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(cleanup);
it("loads owner-gated bytes and revokes them on unmount", async () => {
  const { unmount } = render(<PlaylistCoverImage playlistId="private" alt="Cover" />);
  expect((await screen.findByRole("img", { name: "Cover" })).getAttribute("src")).toBe("blob:cover");
  expect(mocks.fetch).toHaveBeenCalledWith("private", expect.any(AbortSignal));
  unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cover");
});
it("waits for restoration and clears the previous viewer's cover immediately", async () => {
  mocks.session.status = "restoring";
  const { rerender } = render(<PlaylistCoverImage playlistId="private" alt="Cover" />);
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.session.status = "authed";
  rerender(<PlaylistCoverImage playlistId="private" alt="Cover" />);
  await screen.findByRole("img");
  mocks.fetch.mockRejectedValue(new Error("not found"));
  mocks.session.user = { id: "other" };
  rerender(<PlaylistCoverImage playlistId="private" alt="Cover" />);
  expect(screen.queryByRole("img")).toBeNull();
  await screen.findByText("Cover unavailable");
});
it("ignores a completed request after its cover was replaced", async () => {
  let resolve!: (blob: Blob) => void;
  mocks.fetch.mockReturnValueOnce(new Promise<Blob>(done => { resolve = done; }));
  const { rerender } = render(<PlaylistCoverImage playlistId="private" alt="Cover" version={0} />);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  rerender(<PlaylistCoverImage playlistId="private" alt="Cover" version={1} />);
  await screen.findByRole("img");
  await act(async () => resolve(new Blob(["stale"])));
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
