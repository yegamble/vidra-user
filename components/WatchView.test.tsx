// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);

// The session the watch page sees.
let sessionStatus: "restoring" | "anon" | "authed" = "anon";
let sessionUser: { id: string } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: sessionUser }),
  useOptionalSession: () => ({ status: sessionStatus, user: sessionUser }),
}));

// The player and the heavier watch-page children are irrelevant to what this
// file asserts (which requests go out, and when) — stub them so jsdom has no
// media, HLS or IntersectionObserver work to do.
vi.mock("@/components/player/VideoPlayer", () => ({ VideoPlayer: () => <div /> }));
vi.mock("@/components/CommentsSection", () => ({ CommentsSection: () => <div /> }));
vi.mock("@/components/RelatedVideos", () => ({ RelatedVideos: () => <div /> }));
vi.mock("@/components/RatingControls", () => ({ RatingControls: () => <div /> }));
vi.mock("@/components/DownloadButton", () => ({ DownloadButton: () => <div /> }));
vi.mock("@/components/SaveButton", () => ({ SaveButton: () => <div /> }));
vi.mock("@/components/AddToPlaylistButton", () => ({ AddToPlaylistButton: () => <div /> }));
vi.mock("@/components/SupportButton", () => ({ SupportButton: () => <div /> }));
vi.mock("@/components/VideoActionsMenu", () => ({ VideoActionsMenu: () => <div /> }));
vi.mock("@/components/ReportButton", () => ({
  ReportButton: () => <div />,
  ReportDialog: () => <div />,
}));
vi.mock("@/components/UpNextQueue", () => ({ UpNextQueue: () => <div /> }));
vi.mock("@/lib/api/video-config", () => ({
  getVideoConfigCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
  resolveOptionLabel: (_c: unknown, _k: unknown, id: string) => id,
}));

const mocks = vi.hoisted(() => ({
  getVideo: vi.fn(),
  getVideoByCode: vi.fn(),
  getChannel: vi.fn(),
  getCaptions: vi.fn(),
  getWatchProgress: vi.fn(),
  recordVideoView: vi.fn(),
  recordWatchProgress: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: mocks,
  ApiError: class MockApiError extends Error {
    status: number;
    code?: string;
    constructor(status = 500) {
      super("mock api error");
      this.status = status;
    }
  },
  getInstanceCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  videoCaptionUrl: (id: string, lang: string) => `/videos/${id}/captions/${lang}`,
  channelAvatarUrl: (handle: string) => `/channels/${handle}/avatar`,
  isSensitiveVideo: () => false,
  clearPlaybackToken: () => {},
  getPlaybackToken: () => null,
  setPlaybackToken: () => {},
  ipfsHlsMasterUrl: () => undefined,
}));

import { WatchView } from "./WatchView";

function video(): Video {
  return {
    id: "v1",
    channel_id: "c1",
    channel_handle: "film-house",
    channel_display_name: "Film House",
    title: "A video",
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: false,
  } as Video;
}

beforeEach(() => {
  sessionStatus = "anon";
  sessionUser = null;
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getVideo.mockResolvedValue(video());
  mocks.getChannel.mockResolvedValue({
    handle: "film-house",
    display_name: "Film House",
    follower_count: 3,
    is_following: true,
  });
  mocks.getCaptions.mockResolvedValue({ captions: [] });
  mocks.getWatchProgress.mockResolvedValue({ position_seconds: 0 });
  mocks.recordVideoView.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The watch page's channel read is what supplies `is_following` — a PER-VIEWER
// field. It is chained off the resolved video, which normally means it inherits
// the video read's wait for the session. But the page is SERVER-rendered for a
// public video, and that seed paints on the very first render, so the channel
// read fired immediately, anonymously: the Follow button rendered "Follow" for
// a channel the viewer already follows, on every hard load, and the effect
// never re-ran to correct it.
describe("WatchView session settling", () => {
  it("does not read the video while the session is still restoring", async () => {
    sessionStatus = "restoring";
    render(<WatchView id="v1" />);
    await act(async () => {});
    expect(mocks.getVideo).not.toHaveBeenCalled();
  });

  it("does not read the channel from a server seed while the session is still restoring", async () => {
    sessionStatus = "restoring";
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    expect(mocks.getChannel).not.toHaveBeenCalled();
  });

  it("reads the channel exactly once, as the viewer, when the session settles", async () => {
    sessionStatus = "authed";
    sessionUser = { id: "u-1" };
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    expect(mocks.getChannel).toHaveBeenCalledTimes(1);
    expect(mocks.getChannel).toHaveBeenCalledWith("film-house", expect.any(AbortSignal));
  });
});
