// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getMyPlaylists: vi.fn(),
  deletePlaylist: vi.fn(),
  session: { status: "authed", user: { id: "owner" } as { id: string } | null },
}));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: {
    getPlaylist: mocks.getPlaylist,
    getMyPlaylists: mocks.getMyPlaylists,
    deletePlaylist: mocks.deletePlaylist,
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/PlaylistThumbnailManager", () => ({ PlaylistThumbnailManager: () => null }));

import { PlaylistDetailView } from "./PlaylistDetailView";

const playlist = {
  id: "p1",
  title: "Road trip",
  description: "",
  visibility: "public",
  video_count: 0,
  has_thumbnail: false,
  videos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlaylist.mockResolvedValue(playlist);
  mocks.getMyPlaylists.mockResolvedValue({ playlists: [playlist] });
  mocks.deletePlaylist.mockResolvedValue(undefined);
  mocks.session.status = "authed";
  mocks.session.user = { id: "owner" };
});
afterEach(cleanup);

// A11 close-out carry-in: "Delete playlist" destroyed the playlist on a single
// click while the Studio video delete is two-step and the media-GC purge demands
// a typed PURGE. One destructive control in three behaving differently is the
// inconsistency; the single click is the defect.
describe("PlaylistDetailView delete", () => {
  it("asks before destroying the playlist", async () => {
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete playlist" }));

    expect(mocks.deletePlaylist).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm delete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel delete" })).toBeTruthy();
  });

  it("deletes once confirmed", async () => {
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(mocks.deletePlaylist).toHaveBeenCalledWith("p1"));
  });

  it("backs out on cancel, leaving the playlist alone", async () => {
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));

    expect(await screen.findByRole("button", { name: "Delete playlist" })).toBeTruthy();
    expect(mocks.deletePlaylist).not.toHaveBeenCalled();
  });
});
