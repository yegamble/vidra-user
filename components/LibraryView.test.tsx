// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let sessionStatus = "authed";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getWatchHistory: vi.fn(),
    getMyPlaylists: vi.fn(),
    getSavedVideos: vi.fn(),
  },
  videoThumbnailUrl: (id: string) => `/api/v1/videos/${id}/thumbnail`,
  remoteVideoThumbnailUrl: (id: string) => `/api/v1/remote-videos/${id}/thumbnail`,
  playlistThumbnailUrl: (id: string) => `/api/v1/playlists/${id}/thumbnail`,
}));

import { api } from "@/lib/api";
import type { HistoryItem, Playlist, Video } from "@/lib/api";

import { LibraryView } from "./LibraryView";

const mockHistory = vi.mocked(api.getWatchHistory);
const mockPlaylists = vi.mocked(api.getMyPlaylists);
const mockSaved = vi.mocked(api.getSavedVideos);

function video(id: string, title: string, over: Partial<Video> = {}): Video {
  return {
    id,
    channel_id: "c1",
    channel_handle: "aurora-lab",
    channel_display_name: "Aurora Lab",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 10,
    has_thumbnail: false,
    ...over,
  } as Video;
}

function historyItem(
  id: string,
  title: string,
  position: number,
  duration?: number,
): HistoryItem {
  return {
    ...video(id, title, duration !== undefined ? { duration_seconds: duration } : {}),
    position_seconds: position,
    watched_at: new Date().toISOString(),
  } as HistoryItem;
}

function playlist(id: string, title: string, count: number, visibility = "private"): Playlist {
  return {
    id,
    title,
    description: "",
    visibility,
    video_count: count,
    has_thumbnail: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Playlist;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStatus = "authed";
});

describe("LibraryView", () => {
  it("prompts anonymous viewers to sign in and still exposes a single Playlists link", () => {
    sessionStatus = "anon";
    render(<LibraryView />);

    expect(screen.getByText("Sign in to see your library")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Playlists" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/playlists");
    // No data is fetched while signed out.
    expect(mockHistory).not.toHaveBeenCalled();
    expect(mockSaved).not.toHaveBeenCalled();
  });

  it("renders the history rail, playlist rows, and saved rows with exactly one Playlists link", async () => {
    mockHistory.mockResolvedValue({
      videos: [historyItem("h1", "Grading session", 95, 200), historyItem("h2", "Alps diary", 0, 400)],
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({
      playlists: [playlist("p1", "Watch later", 6, "private"), playlist("p2", "Show reel", 1, "public")],
    });
    mockSaved.mockResolvedValue({
      videos: [video("s1", "Saved clip")],
      sort: "recent",
      limit: 20,
      offset: 0,
    });

    render(<LibraryView />);

    // History rail: section + "See all" → /history, and a real progress bar
    // (95/200 = 47.5%) on the item that has a saved position; none on the 0.
    await screen.findByRole("heading", { name: "History" });
    expect(screen.getByRole("link", { name: "See all" }).getAttribute("href")).toBe("/history");
    const bars = document.querySelectorAll("[data-resume-progress]");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("data-resume-progress")).toBe("47.5");
    expect(screen.getByRole("link", { name: "Grading session" }).getAttribute("href")).toBe(
      "/videos/h1",
    );

    // Playlists rows.
    const watchLater = await screen.findByRole("link", { name: /Watch later/ });
    expect(watchLater.getAttribute("href")).toBe("/playlists/p1");
    expect(screen.getByText("6 videos · Private")).toBeTruthy();
    expect(screen.getByText("1 video · Public")).toBeTruthy();

    // Saved rows: the title is a heading and links to the watch page.
    const saved = await screen.findByRole("heading", { name: "Saved clip" });
    expect(saved).toBeTruthy();
    expect(screen.getByRole("link", { name: "Saved clip" }).getAttribute("href")).toBe(
      "/videos/s1",
    );

    // Exactly one link is named "Playlists" (the section header → /playlists).
    const playlistsLinks = screen.getAllByRole("link", { name: "Playlists" });
    expect(playlistsLinks).toHaveLength(1);
    expect(playlistsLinks[0].getAttribute("href")).toBe("/playlists");
  });

  it("hides the History section when there is nothing watched and shows empty hints", async () => {
    mockHistory.mockResolvedValue({ videos: [], limit: 12, offset: 0 });
    mockPlaylists.mockResolvedValue({ playlists: [] });
    mockSaved.mockResolvedValue({ videos: [], sort: "recent", limit: 20, offset: 0 });

    render(<LibraryView />);

    await waitFor(() => expect(mockSaved).toHaveBeenCalled());
    // No History heading / See all when history is empty.
    expect(screen.queryByRole("heading", { name: "History" })).toBeNull();
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
    // Playlists entry stays present; empty hints render.
    expect(screen.getByText("No playlists yet. Create one to organise videos.")).toBeTruthy();
    expect(await screen.findByText("Your library is empty")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Playlists" })).toHaveLength(1);
  });

  it("requests a bounded history preview with an abort signal", async () => {
    mockHistory.mockResolvedValue({ videos: [], limit: 12, offset: 0 });
    mockPlaylists.mockResolvedValue({ playlists: [] });
    mockSaved.mockResolvedValue({ videos: [], sort: "recent", limit: 20, offset: 0 });
    render(<LibraryView />);
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(mockHistory).toHaveBeenCalledWith({ limit: 12 }, expect.any(AbortSignal));
  });
});
