// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
let sessionUser: { id: string; role?: string } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: sessionUser }),
  useOptionalSession: () => ({ status: sessionStatus, user: sessionUser }),
}));

// The player and the heavier watch-page children are irrelevant to what this
// file asserts (which requests go out, and when) — stub them so jsdom has no
// media, HLS or IntersectionObserver work to do.
vi.mock("@/components/player/VideoPlayer", () => ({ VideoPlayer: () => <div /> }));
// The props the comments section was last rendered with (reviewer gating).
const commentsProps = vi.hoisted(() => ({ last: null as null | { canManageComments?: boolean } }));
vi.mock("@/components/CommentsSection", () => ({
  CommentsSection: (p: { canManageComments?: boolean }) => {
    commentsProps.last = p;
    return <div />;
  },
}));
vi.mock("@/components/RelatedVideos", () => ({ RelatedVideos: () => <div /> }));
vi.mock("@/components/RatingControls", () => ({ RatingControls: () => <div /> }));
vi.mock("@/components/DownloadButton", () => ({ DownloadButton: () => <div /> }));
vi.mock("@/components/SaveButton", () => ({ SaveButton: () => <div /> }));
// A spy, so the wiring of the video's own support text into the button is observable.
const supportButton = vi.hoisted(() => vi.fn());
vi.mock("@/components/SupportButton", () => ({
  SupportButton: (props: { text?: string | null }) => {
    supportButton(props);
    return <div />;
  },
}));
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
  getMyChannels: vi.fn(),
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

import { invalidateVideoActionPermissionCache } from "@/lib/use-video-action-permissions";

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
  mocks.getMyChannels.mockResolvedValue({ channels: [] });
  commentsProps.last = null;
  invalidateVideoActionPermissionCache();
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

// Comment approval (core 0161): every reviewer the server accepts — the owner,
// an editor member, staff — gets the inline Approve/Reject (and pin/heart)
// controls, through the shared video-permissions seam; nobody else does.
describe("WatchView comment reviewer controls", () => {
  const reviewerFlag = async (user: { id: string; role?: string }, myChannels: string[]) => {
    sessionStatus = "authed";
    sessionUser = user;
    mocks.getMyChannels.mockResolvedValue({ channels: myChannels.map((id) => ({ id })) });
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    return commentsProps.last?.canManageComments;
  };

  it("gives the channel owner the controls from the video's own channel alone", async () => {
    // The owner is known from the channel the page already loaded; their Pin/
    // Heart (and Approve/Reject) must never wait on, or depend on, /me/channels.
    mocks.getChannel.mockResolvedValue({ handle: "film-house", display_name: "Film House", owner_id: "u-owner" });
    mocks.getMyChannels.mockReturnValue(new Promise(() => {}));
    sessionStatus = "authed";
    sessionUser = { id: "u-owner" };
    render(<WatchView id="v1" initialVideo={video()} />);
    await waitFor(() => expect(commentsProps.last?.canManageComments).toBe(true));
  });

  it("gives a channel editor the reviewer controls", async () => {
    await reviewerFlag({ id: "u-editor" }, ["c1"]);
    await waitFor(() => expect(commentsProps.last?.canManageComments).toBe(true));
  });

  it("gives staff the reviewer controls", async () => {
    expect(await reviewerFlag({ id: "u-mod", role: "moderator" }, [])).toBe(true);
  });

  it("withholds them from a viewer who manages none of the video's channels", async () => {
    expect(await reviewerFlag({ id: "u-viewer" }, ["some-other-channel"])).toBe(false);
  });
});

// An internal video (PeerTube's members-only tier) answers an anonymous read
// with 401 sign_in_required. The page offers the app's ordinary sign-in prompt
// — not "not found", which would tell a member the video does not exist, and
// not the retry surface, which would never succeed.
describe("WatchView internal video", () => {
  it("offers an anonymous viewer the sign-in prompt", async () => {
    mocks.getVideo.mockRejectedValue(Object.assign(new Error("sign in"), { status: 401, code: "sign_in_required" }));
    render(<WatchView id="v1" />);
    await act(async () => {});
    expect(screen.getByText("Sign in to watch this video")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByText("Video not found")).toBeNull();
  });

  it("keeps the generic error for a 401 that is not a sign-in refusal", async () => {
    mocks.getVideo.mockRejectedValue(Object.assign(new Error("expired"), { status: 401, code: "unauthorized" }));
    render(<WatchView id="v1" />);
    await act(async () => {});
    expect(screen.queryByText("Sign in to watch this video")).toBeNull();
  });
});

// PeerTube's free-text "support" message is the VIDEO'S own (a new video
// snapshots its channel's), and rides the one Support button rather than a
// second affordance.
describe("WatchView support text", () => {
  it("hands the video's support text to the Support button", async () => {
    supportButton.mockClear();
    render(<WatchView id="v1" initialVideo={{ ...video(), support: "Liberapay: film-house" }} />);
    await act(async () => {});
    expect(supportButton).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Liberapay: film-house" }),
    );
  });

  it("passes no text for a video without one", async () => {
    supportButton.mockClear();
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    expect(supportButton).toHaveBeenCalled();
    expect(supportButton.mock.calls.every(([p]) => !p.text)).toBe(true);
  });
});

describe("WatchView signed-out resume", () => {
  it("offers Resume from the position this browser remembers", async () => {
    window.localStorage.setItem("vidra.position.v1", "75");
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Resume from 1:15" })).toBeTruthy();
    expect(mocks.getWatchProgress).not.toHaveBeenCalled();
    window.localStorage.clear();
  });

  it("offers nothing when no position is remembered or the URL carries ?t=", async () => {
    render(<WatchView id="v1" initialVideo={video()} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Resume from/ })).toBeNull();
  });
});
