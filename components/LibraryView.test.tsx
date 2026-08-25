// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const previewMocks = vi.hoisted(() => ({
  featureEnabled: false,
  preferenceEnabled: false,
  sensitivePolicy: "display" as "display" | "warn" | "blur",
  restrictedMode: false,
  props: new Map<string, Record<string, unknown>>(),
}));

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

vi.mock("@/components/VideoActionsMenu", () => ({
  VideoActionsMenu: ({
    video,
    onDeleted,
  }: {
    video: { title: string };
    onDeleted?: () => void;
  }) => (
    <button type="button" aria-label={`Actions for ${video.title}`} onClick={onDeleted}>
      Actions
    </button>
  ),
}));

vi.mock("@/components/VideoCardPreview", () => ({
  VideoCardPreview: (props: Record<string, unknown>) => {
    previewMocks.props.set(String(props.videoId), props);
    return (
      <a href={String(props.href)} aria-label={String(props.title)} data-testid={`preview-${props.videoId}`}>
        {props.fallback as React.ReactNode}
        {props.overlay as React.ReactNode}
      </a>
    );
  },
}));

vi.mock("@/lib/instance-features", () => ({
  useInstanceFeatures: () => ({ video_card_previews: previewMocks.featureEnabled }),
}));

vi.mock("@/lib/player-settings", () => ({
  usePlayerSettings: () => ({
    video_card_previews_enabled: previewMocks.preferenceEnabled,
  }),
}));

vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => previewMocks.sensitivePolicy,
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => previewMocks.restrictedMode,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getWatchHistory: vi.fn(),
    getMyPlaylists: vi.fn(),
    getSavedVideos: vi.fn(),
  },
  isSensitiveVideo: (candidate: { is_sensitive?: boolean }) => candidate.is_sensitive === true,
  videoThumbnailUrl: (id: string) => `/api/v1/videos/${id}/thumbnail`,
  videoOriginalUrl: (id: string) => `/api/v1/videos/${id}/original`,
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
  previewMocks.featureEnabled = false;
  previewMocks.preferenceEnabled = false;
  previewMocks.sensitivePolicy = "display";
  previewMocks.restrictedMode = false;
  previewMocks.props.clear();
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
      total: 2,
      videos: [historyItem("h1", "Grading session", 95, 200), historyItem("h2", "Alps diary", 0, 400)],
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({
      total: 2, limit: 20, offset: 0,
      playlists: [playlist("p1", "Watch later", 6, "private"), playlist("p2", "Show reel", 1, "public")],
    });
    mockSaved.mockResolvedValue({
      total: 1,
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
    const historyLinks = screen.getAllByRole("link", { name: "Grading session" });
    expect(historyLinks).toHaveLength(2);
    expect(historyLinks.every((link) => link.getAttribute("href") === "/videos/h1")).toBe(true);
    expect(historyLinks.some((link) => link.textContent?.includes("No preview"))).toBe(true);

    // Playlists rows.
    const watchLater = await screen.findByRole("link", { name: /Watch later/ });
    expect(watchLater.getAttribute("href")).toBe("/playlists/p1");
    expect(screen.getByText("6 videos · Private")).toBeTruthy();
    expect(screen.getByText("1 video · Public")).toBeTruthy();

    // Saved rows: the title is a heading and links to the watch page.
    const saved = await screen.findByRole("heading", { name: "Saved clip" });
    expect(saved).toBeTruthy();
    const savedLinks = screen.getAllByRole("link", { name: "Saved clip" });
    expect(savedLinks).toHaveLength(2);
    expect(savedLinks.every((link) => link.getAttribute("href") === "/videos/s1")).toBe(true);
    const savedActions = screen.getByRole("button", { name: "Actions for Saved clip" });
    const historyActions = screen.getByRole("button", { name: "Actions for Grading session" });
    for (const button of [savedActions, historyActions]) {
      expect(button.parentElement?.className).toContain("opacity-0");
      expect(button.parentElement?.className).toContain("group-hover/card:opacity-100");
      expect(button.parentElement?.className).toContain("group-focus-within/card:opacity-100");
      expect(button.parentElement?.className).toContain("[@media(hover:none)]:opacity-100");
    }

    // Exactly one link is named "Playlists" (the section header → /playlists).
    const playlistsLinks = screen.getAllByRole("link", { name: "Playlists" });
    expect(playlistsLinks).toHaveLength(1);
    expect(playlistsLinks[0].getAttribute("href")).toBe("/playlists");
  });

  it("hides the History section when there is nothing watched and shows empty hints", async () => {
    mockHistory.mockResolvedValue({ total: 0, videos: [], limit: 12, offset: 0 });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({ total: 0, videos: [], sort: "recent", limit: 20, offset: 0 });

    render(<LibraryView />);

    await waitFor(() => expect(mockSaved).toHaveBeenCalled());
    // No History heading / See all when history is empty.
    expect(screen.queryByRole("heading", { name: "History" })).toBeNull();
    expect(screen.queryByRole("link", { name: "See all" })).toBeNull();
    // Playlists entry stays present; empty hints render.
    expect(await screen.findByText("No playlists yet. Create one to organise videos.")).toBeTruthy();
    expect(await screen.findByText("Your library is empty")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Playlists" })).toHaveLength(1);
  });

  it("requests a bounded history preview with an abort signal", async () => {
    mockHistory.mockResolvedValue({ total: 0, videos: [], limit: 12, offset: 0 });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({ total: 0, videos: [], sort: "recent", limit: 20, offset: 0 });
    render(<LibraryView />);
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(mockHistory).toHaveBeenCalledWith({ limit: 12 }, expect.any(AbortSignal));
  });

  it("removes deleted history and saved entries from their owning lists", async () => {
    mockHistory.mockResolvedValue({
      total: 1,
      videos: [historyItem("h1", "History deletion", 12, 100)],
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({
      total: 1,
      videos: [video("s1", "Saved deletion")],
      sort: "recent",
      limit: 20,
      offset: 0,
    });

    render(<LibraryView />);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for History deletion" }));
    expect(screen.queryByRole("link", { name: "History deletion" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "History" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Saved deletion" }));
    expect(screen.queryByRole("heading", { name: "Saved deletion" })).toBeNull();
    expect(screen.getByText("Your library is empty")).toBeTruthy();
  });

  it("previews local published history and saved videos only when both gates allow it", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    mockHistory.mockResolvedValue({
      total: 1,
      videos: [historyItem("h1", "Preview history", 12, 100)],
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({
      total: 1,
      videos: [video("s1", "Preview saved", { duration_seconds: 120 })],
      sort: "recent",
      limit: 20,
      offset: 0,
    });

    render(<LibraryView />);
    await screen.findByRole("heading", { name: "Preview saved" });

    expect(previewMocks.props.get("h1")?.previewEnabled).toBe(true);
    expect(previewMocks.props.get("h1")?.src).toBe("/api/v1/videos/h1/original");
    expect(previewMocks.props.get("s1")?.previewEnabled).toBe(true);
    expect(previewMocks.props.get("s1")?.src).toBe("/api/v1/videos/s1/original");
  });

  it("keeps library originals private when either gate is off", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = false;
    mockHistory.mockResolvedValue({
      total: 1,
      videos: [historyItem("h1", "Preview history", 12, 100)],
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({
      total: 1,
      videos: [video("s1", "Preview saved")],
      sort: "recent",
      limit: 20,
      offset: 0,
    });

    render(<LibraryView />);
    await screen.findByRole("heading", { name: "Preview saved" });

    expect(previewMocks.props.get("h1")?.src).toBeNull();
    expect(previewMocks.props.get("s1")?.src).toBeNull();
  });

  it("never previews federated, private, or blurred-sensitive library entries", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    previewMocks.sensitivePolicy = "blur";
    mockHistory.mockResolvedValue({
      total: 3,
      videos: [
        historyItem("remote", "Remote history", 12, 100) as HistoryItem,
        { ...historyItem("sensitive", "Sensitive history", 12, 100), is_sensitive: true },
      ].map((item, index) => (index === 0 ? { ...item, remote: true } : item)),
      limit: 12,
      offset: 0,
    });
    mockPlaylists.mockResolvedValue({ total: 0, limit: 20, offset: 0, playlists: [], });
    mockSaved.mockResolvedValue({
      total: 1,
      videos: [video("private", "Private saved", { privacy: "private" })],
      sort: "recent",
      limit: 20,
      offset: 0,
    });

    render(<LibraryView />);
    await screen.findByRole("heading", { name: "Private saved" });

    expect(previewMocks.props.get("remote")?.src).toBeNull();
    expect(previewMocks.props.get("private")?.src).toBeNull();
    expect(previewMocks.props.get("sensitive")?.src).toBeNull();
    expect(String(previewMocks.props.get("sensitive")?.posterClassName)).toContain("blur-2xl");
  });
});
