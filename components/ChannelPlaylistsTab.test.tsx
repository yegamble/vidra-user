// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listChannelPlaylists: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { listChannelPlaylists: mocks.listChannelPlaylists },
}));
vi.mock("@/components/PlaylistCard", () => ({
  PlaylistCard: ({ playlist }: { playlist: { title: string } }) => <span>{playlist.title}</span>,
}));

import { ChannelPlaylistsTab } from "./ChannelPlaylistsTab";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, title: `List ${from + i}` }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ChannelPlaylistsTab", () => {
  it("lists the channel's playlists and pages through the shared seam", async () => {
    mocks.listChannelPlaylists.mockImplementation((_h: string, _s: unknown, p: { offset?: number }) =>
      Promise.resolve(
        p.offset
          ? { playlists: rows(20, 2), total: 22, limit: 20, offset: 20 }
          : { playlists: rows(0, 20), total: 22, limit: 20, offset: 0 },
      ),
    );
    render(<ChannelPlaylistsTab handle="ada" name="Ada" />);
    expect(await screen.findByText("List 0")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Playlists by Ada" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("List 21")).toBeTruthy();
    expect(mocks.listChannelPlaylists).toHaveBeenLastCalledWith(
      "ada",
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 20 }),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows an empty state when the channel has no playlists", async () => {
    mocks.listChannelPlaylists.mockResolvedValue({ playlists: [], total: 0, limit: 20, offset: 0 });
    render(<ChannelPlaylistsTab handle="ada" name="Ada" />);
    expect(await screen.findByText("No playlists yet")).toBeTruthy();
  });

  it("shows an error with a retry that re-asks", async () => {
    mocks.listChannelPlaylists.mockRejectedValueOnce(new Error("boom"));
    mocks.listChannelPlaylists.mockResolvedValue({ playlists: rows(0, 1), total: 1, limit: 20, offset: 0 });
    render(<ChannelPlaylistsTab handle="ada" name="Ada" />);
    expect(await screen.findByText("Could not load this channel's playlists.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText("List 0")).toBeTruthy();
  });
});
