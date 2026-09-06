// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(), getMyPlaylists: vi.fn(),
  getChannel: vi.fn(),
  listChannelVideos: vi.fn(),
  session: { status: "restoring", user: null as { id: string } | null },
}));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => mocks.session }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual("@/lib/api"),
  api: { getChannel: mocks.getChannel, listChannelVideos: mocks.listChannelVideos,
    getPlaylist: mocks.getPlaylist, getMyPlaylists: mocks.getMyPlaylists },
}));
vi.mock("@/components/FollowButton", () => ({
  FollowButton: ({ initialFollowing }: { initialFollowing: boolean }) =>
    <button>{initialFollowing ? "Following" : "Follow"}</button>,
}));
vi.mock("@/components/ChannelLiveBadge", () => ({ ChannelLiveBadge: () => null }));
vi.mock("@/components/MessageButton", () => ({ MessageButton: () => null }));
vi.mock("@/components/SupportButton", () => ({ SupportButton: () => null }));

import { ApiError } from "@/lib/api";
import { ChannelView } from "./ChannelView";
import { PlaylistDetailView } from "./PlaylistDetailView";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/PlaylistThumbnailManager", () => ({ PlaylistThumbnailManager: () => null }));
const playlist = { id: "p1", title: "Private mix", description: "", visibility: "private",
  video_count: 0, has_thumbnail: false, videos: [] };

const channel = { id: "c1", owner_id: "creator", handle: "creator", display_name: "Creator",
  description: "", created_at: "2026-09-05T00:00:00Z", follower_count: 1, is_following: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPlaylist.mockResolvedValue(playlist);
  mocks.getMyPlaylists.mockResolvedValue({ playlists: [playlist] });
  mocks.session.status = "restoring";
  mocks.session.user = null;
  mocks.getChannel.mockResolvedValue(channel);
  mocks.listChannelVideos.mockResolvedValue({ videos: [] });
});
afterEach(cleanup);

describe("ChannelView session restoration", () => {
  it("waits for restoration before reading viewer-specific follow state", async () => {
    const { rerender } = render(<ChannelView handle="creator" />);
    expect(mocks.getChannel).not.toHaveBeenCalled();
    expect(mocks.listChannelVideos).not.toHaveBeenCalled();
    mocks.session.status = "authed";
    mocks.session.user = { id: "viewer" };
    rerender(<ChannelView handle="creator" />);
    expect(await screen.findByRole("button", { name: "Following" })).toBeTruthy();
    expect(mocks.getChannel).toHaveBeenCalledTimes(1);
  });

  it("clears the prior viewer's state while a different account is loading", async () => {
    mocks.session.status = "authed";
    mocks.session.user = { id: "viewer-a" };
    const { rerender } = render(<ChannelView handle="creator" />);
    await screen.findByRole("button", { name: "Following" });
    let resolve!: (value: typeof channel) => void;
    mocks.getChannel.mockReturnValue(new Promise<typeof channel>((done) => { resolve = done; }));
    mocks.session.user = { id: "viewer-b" };
    rerender(<ChannelView handle="creator" />);
    expect(screen.queryByRole("button", { name: "Following" })).toBeNull();
    await waitFor(() => expect(mocks.getChannel).toHaveBeenCalledTimes(2));
    resolve({ ...channel, is_following: false });
    expect(await screen.findByRole("button", { name: "Follow" })).toBeTruthy();
  });

  it("keeps not-found distinct from a retryable request failure", async () => {
    mocks.session.status = "anon";
    mocks.getChannel.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "missing" }));
    render(<ChannelView handle="missing" />);
    expect(await screen.findByText("Channel not found")).toBeTruthy();
  });

  it("retries a failed channel read", async () => {
    mocks.session.status = "authed";
    mocks.session.user = { id: "viewer" };
    mocks.getChannel.mockRejectedValueOnce(new Error("network"));
    render(<ChannelView handle="creator" />);
    await screen.findByText("Could not load this channel.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Following" })).toBeTruthy();
  });
});


describe("PlaylistDetailView session restoration", () => {
  it("loads the owner's private playlist after session restoration", async () => {
    const { rerender } = render(<PlaylistDetailView id="p1" />);
    expect(mocks.getPlaylist).not.toHaveBeenCalled();
    mocks.session.status = "authed";
    mocks.session.user = { id: "owner" };
    rerender(<PlaylistDetailView id="p1" />);
    await screen.findByRole("heading", { name: "Private mix" });
    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("clears private playlist data and owner controls on sign out", async () => {
    mocks.session.status = "authed";
    mocks.session.user = { id: "owner" };
    const { rerender } = render(<PlaylistDetailView id="p1" />);
    await screen.findByRole("button", { name: "Edit" });
    mocks.getPlaylist.mockRejectedValue(new ApiError({ status: 404, code: "not_found", message: "private" }));
    mocks.session.status = "anon";
    mocks.session.user = null;
    rerender(<PlaylistDetailView id="p1" />);
    expect(screen.queryByRole("heading", { name: "Private mix" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(await screen.findByText("Playlist not found")).toBeTruthy();
  });
});
