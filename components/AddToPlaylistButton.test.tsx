// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyPlaylists: vi.fn(), addToPlaylist: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getMyPlaylists: mocks.getMyPlaylists, addToPlaylist: mocks.addToPlaylist },
}));

import { AddToPlaylistButton } from "./AddToPlaylistButton";
import { PlaylistPickerDialog } from "./PlaylistPickerDialog";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, title: `List ${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addToPlaylist.mockResolvedValue(undefined);
  mocks.getMyPlaylists.mockImplementation((_s: unknown, p: { offset?: number }) =>
    Promise.resolve(
      p?.offset
        ? { playlists: rows(20, 2), total: 22, limit: 20, offset: 20 }
        : { playlists: rows(0, 20), total: 22, limit: 20, offset: 0 },
    ),
  );
});
afterEach(cleanup);

async function expectCanReachPlaylist21() {
  await screen.findByRole("button", { name: /List 0$/ });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  fireEvent.click(await screen.findByRole("button", { name: /List 21$/ }));
  expect(mocks.getMyPlaylists).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ limit: 20, offset: 20 }),
  );
  await vi.waitFor(() => expect(mocks.addToPlaylist).toHaveBeenCalledWith("p21", "v1"));
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
}

describe("playlist pickers page past the first 20", () => {
  it("AddToPlaylistButton menu", async () => {
    render(<AddToPlaylistButton videoId="v1" />);
    fireEvent.click(screen.getByRole("button", { name: /Save to playlist/ }));
    await expectCanReachPlaylist21();
  });

  it("PlaylistPickerDialog", async () => {
    render(<PlaylistPickerDialog videoId="v1" onClose={() => {}} />);
    await expectCanReachPlaylist21();
  });
});
