// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getMyPlaylists: vi.fn(),
  deletePlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  getMyChannels: vi.fn(),
  movePlaylistItem: vi.fn(),
  removeFromPlaylist: vi.fn(),
  session: { status: "authed", user: { id: "owner" } as { id: string } | null },
}));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: {
    getPlaylist: mocks.getPlaylist,
    getMyPlaylists: mocks.getMyPlaylists,
    deletePlaylist: mocks.deletePlaylist,
    updatePlaylist: mocks.updatePlaylist,
    getMyChannels: mocks.getMyChannels,
    movePlaylistItem: mocks.movePlaylistItem,
    removeFromPlaylist: mocks.removeFromPlaylist,
  },
}));
vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/PlaylistThumbnailManager", () => ({ PlaylistThumbnailManager: () => null }));

import { PlaylistDetailView } from "./PlaylistDetailView";

const playlist = {
  id: "p1",
  owner_id: "owner",
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
  mocks.updatePlaylist.mockResolvedValue(undefined);
  mocks.getMyChannels.mockResolvedValue({ channels: [{ id: "c1", handle: "ada", display_name: "Ada TV", role: "owner" }], total: 1 });
  mocks.movePlaylistItem.mockResolvedValue(undefined);
  mocks.removeFromPlaylist.mockResolvedValue(undefined);
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

const videos = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, title: `Video ${from + i}` }));

// 25 items: the backend's default page of 20, then 5 more at offset 20.
function serveLongPlaylist(overrides: Record<string, unknown> = {}) {
  mocks.getPlaylist.mockImplementation((_id: string, p: { offset?: number } = {}) =>
    Promise.resolve({
      ...playlist,
      video_count: 25,
      ...overrides,
      ...(p.offset
        ? { videos: videos(21, 5), total: 25, limit: 20, offset: 20 }
        : { videos: videos(1, 20), total: 25, limit: 20, offset: 0 }),
    }),
  );
}

/** The item titles in on-screen order, read from each item's "Move … up" control. */
function order() {
  return screen
    .getAllByRole("button", { name: /^Move .* up$/ })
    .map((b) => b.getAttribute("aria-label")!.replace(/^Move | up$/g, ""));
}

async function loadPageTwo() {
  render(<PlaylistDetailView id="p1" />);
  await screen.findByText("Video 1");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Video 25");
}

// Items are paged (default 20) since core v0.4.0; the detail view fetched once,
// so items 21+ were unreachable and the full-list reorder PUT always failed.
describe("PlaylistDetailView paging", () => {
  it("appends page 2 at offset 20 and stops at the total", async () => {
    serveLongPlaylist();
    await loadPageTwo();

    expect(mocks.getPlaylist).toHaveBeenCalledWith("p1", { limit: 20, offset: 0 }, expect.anything());
    expect(mocks.getPlaylist).toHaveBeenLastCalledWith(
      "p1",
      expect.objectContaining({ limit: 20, offset: 20 }),
      expect.anything(),
    );
    expect(screen.getByText("Video 1")).toBeTruthy(); // appended, not replaced
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("PlaylistDetailView reorder", () => {
  it("moves an item from page 2 after the item now above it, without the full list", async () => {
    serveLongPlaylist();
    await loadPageTwo();
    fireEvent.click(screen.getByRole("button", { name: "Move Video 22 up" }));

    await waitFor(() => expect(mocks.movePlaylistItem).toHaveBeenCalledWith("p1", "v22", "v20"));
    expect(order().slice(19, 23)).toEqual(["Video 20", "Video 22", "Video 21", "Video 23"]);
  });

  it("moves an item to the front with a null anchor", async () => {
    serveLongPlaylist();
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Move Video 2 up" }));

    await waitFor(() => expect(mocks.movePlaylistItem).toHaveBeenCalledWith("p1", "v2", null));
    expect(order().slice(0, 2)).toEqual(["Video 2", "Video 1"]);
  });

  it("moves an item down after its next neighbour", async () => {
    serveLongPlaylist();
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Move Video 1 down" }));

    await waitFor(() => expect(mocks.movePlaylistItem).toHaveBeenCalledWith("p1", "v1", "v2"));
  });

  it("puts the item back when the move fails", async () => {
    serveLongPlaylist();
    mocks.movePlaylistItem.mockRejectedValue(new Error("offline"));
    await loadPageTwo();
    fireEvent.click(screen.getByRole("button", { name: "Move Video 22 up" }));

    await waitFor(() => expect(mocks.movePlaylistItem).toHaveBeenCalled());
    await waitFor(() =>
      expect(order().slice(19, 23)).toEqual(["Video 20", "Video 21", "Video 22", "Video 23"]),
    );
  });
});

describe("PlaylistDetailView ownership", () => {
  it("shows owner controls from owner_id for an owner of more than 20 playlists", async () => {
    // The first page of GET /me/playlists does not contain p1 — the old check
    // searched only that page and hid the owner's controls.
    mocks.getMyPlaylists.mockResolvedValue({
      playlists: Array.from({ length: 20 }, (_, i) => ({ ...playlist, id: `other-${i}` })),
      total: 21,
    });
    render(<PlaylistDetailView id="p1" />);

    expect(await screen.findByRole("button", { name: "Delete playlist" })).toBeTruthy();
    expect(mocks.getMyPlaylists).not.toHaveBeenCalled();
  });

  it("hides owner controls from a signed-in viewer who does not own it", async () => {
    serveLongPlaylist({ owner_id: "someone-else" });
    render(<PlaylistDetailView id="p1" />);
    await screen.findByText("Video 1");

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete playlist" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Move .* up$/ })).toBeNull();
  });
});

describe("PlaylistDetailView items", () => {
  it("removes an item and takes it off the count", async () => {
    serveLongPlaylist();
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Video 1 from playlist" }));

    await waitFor(() => expect(mocks.removeFromPlaylist).toHaveBeenCalledWith("p1", "v1"));
    expect(screen.queryByText("Video 1")).toBeNull();
    expect(screen.getByText(/^24 videos/)).toBeTruthy();
  });

  it("renders the description as user text, links included", async () => {
    mocks.getPlaylist.mockResolvedValue({
      ...playlist,
      description: "Notes at [the docs](https://example.test/notes)",
    });
    render(<PlaylistDetailView id="p1" />);

    const link = await screen.findByRole("link", { name: "the docs" });
    expect(link.getAttribute("href")).toBe("https://example.test/notes");
  });
});

describe("PlaylistDetailView play all", () => {
  const videos = [
    { id: "a1", title: "First" },
    { id: "b2", title: "Second" },
  ];
  beforeEach(() => {
    mocks.getPlaylist.mockResolvedValue({ ...playlist, video_count: 2, total: 2, videos });
  });

  it("opens the first video in playlist mode", async () => {
    render(<PlaylistDetailView id="p1" />);
    const link = await screen.findByRole("link", { name: /Play all/ });
    expect(link.getAttribute("href")).toBe("/videos/a1?playlist=p1&index=1");
  });

  it("each item can start playback from its own position", async () => {
    render(<PlaylistDetailView id="p1" />);
    const link = await screen.findByRole("link", { name: "Play Second in the playlist" });
    expect(link.getAttribute("href")).toBe("/videos/b2?playlist=p1&index=2");
  });

  it("offers no Play all for an empty playlist", async () => {
    mocks.getPlaylist.mockResolvedValue({ ...playlist, total: 0 });
    render(<PlaylistDetailView id="p1" />);
    await screen.findByText("This playlist is empty");
    expect(screen.queryByRole("link", { name: /Play all/ })).toBeNull();
  });
});

describe("PlaylistDetailView channel link", () => {
  it("attaches, leaves alone, and detaches the channel", async () => {
    mocks.getPlaylist.mockResolvedValue({ ...playlist, channel_id: "c1" });
    render(<PlaylistDetailView id="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("option", { name: "Ada TV" });
    const picker = screen.getByLabelText("Channel") as HTMLSelectElement;
    expect(picker.value).toBe("c1");

    // Unchanged: no channel_id key, so core leaves the link as it is.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updatePlaylist).toHaveBeenCalledTimes(1));
    expect(mocks.updatePlaylist.mock.calls[0][1]).not.toHaveProperty("channel_id");

    // None: an explicit null detaches it.
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("option", { name: "Ada TV" });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updatePlaylist).toHaveBeenCalledTimes(2));
    expect(mocks.updatePlaylist.mock.calls[1][1]).toHaveProperty("channel_id", null);
  });
});
