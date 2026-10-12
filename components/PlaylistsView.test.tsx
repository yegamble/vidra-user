// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyPlaylists: vi.fn(), getMyChannels: vi.fn(), createPlaylist: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getMyPlaylists: mocks.getMyPlaylists, getMyChannels: mocks.getMyChannels, createPlaylist: mocks.createPlaylist },
}));
vi.mock("@/components/PlaylistCard", () => ({
  PlaylistCard: ({ playlist }: { playlist: { title: string } }) => <span>{playlist.title}</span>,
}));

import { PlaylistsView } from "./PlaylistsView";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, title: `List ${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyChannels.mockResolvedValue({ channels: [{ id: "c1", handle: "ada", display_name: "Ada TV", role: "owner" }], total: 1 });
  mocks.getMyPlaylists.mockImplementation((_signal: unknown, p: { offset?: number }) =>
    Promise.resolve(
      p?.offset
        ? { playlists: rows(20, 2), total: 22, limit: 20, offset: 20 }
        : { playlists: rows(0, 20), total: 22, limit: 20, offset: 0 },
    ),
  );
});
afterEach(cleanup);

describe("PlaylistsView paging", () => {
  it("reaches playlists beyond the first 20 and stops at the total", async () => {
    render(<PlaylistsView />);
    await screen.findByText("List 0");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("List 21")).toBeTruthy();
    expect(mocks.getMyPlaylists).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 20 }),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("PlaylistsView channel picker", () => {
  it("creates a playlist attached to the chosen channel, and omits channel_id for None", async () => {
    mocks.createPlaylist.mockResolvedValue({ id: "new", title: "Faves" });
    render(<PlaylistsView />);
    await screen.findByText("List 0");
    await screen.findByRole("option", { name: "Ada TV" });
    fireEvent.change(screen.getByLabelText("Playlist title"), { target: { value: "Faves" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(mocks.createPlaylist).toHaveBeenLastCalledWith({ title: "Faves", visibility: "private", channel_id: "c1" }),
    );

    // The picker resets to None, which sends no channel_id at all.
    await waitFor(() => expect((screen.getByLabelText("Channel") as HTMLSelectElement).value).toBe(""));
    fireEvent.change(screen.getByLabelText("Playlist title"), { target: { value: "Plain" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(mocks.createPlaylist).toHaveBeenLastCalledWith({ title: "Plain", visibility: "private" }));
  });
});
