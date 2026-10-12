// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyPlaylists: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getMyPlaylists: mocks.getMyPlaylists },
}));
vi.mock("@/components/PlaylistCard", () => ({
  PlaylistCard: ({ playlist }: { playlist: { title: string } }) => <span>{playlist.title}</span>,
}));

import { PlaylistsView } from "./PlaylistsView";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, title: `List ${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
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
