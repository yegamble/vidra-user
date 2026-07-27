// @vitest-environment jsdom
//
// WatchView sensitive-content gate: the confirmation scrim must fire under the
// effective blur/warn/HIDE policy (hide is server-enforced in listings, but a
// direct link still reaches the watch page) and surface the creator's optional
// content-warning text. The page's heavy children are stubbed — this exercises
// only the gate branch inside WatchView itself.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  policy: null as string | null,
  getVideo: vi.fn(),
  getChannel: vi.fn(),
  getCaptions: vi.fn(),
  getWatchProgress: vi.fn(),
}));

// Hoisted so the vi.mock factories below (which are hoisted above imports) can
// reference it.
const stub = vi.hoisted(() => (name: string) => {
  function Stub() {
    return <div data-testid={`stub-${name}`} />;
  }
  Stub.displayName = `Stub(${name})`;
  return Stub;
});

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// Session: anonymous viewer (the gate does not depend on being signed in).
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: null }),
}));

// The gate's effective policy — the unit under variation here.
vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => mocks.policy,
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => false,
}));

vi.mock("@/lib/instance-defaults", () => ({
  useInstanceDefaults: () => null,
}));

vi.mock("@/lib/video-queue", () => ({
  useVideoQueue: () => [],
  dequeueVideo: () => {},
}));

vi.mock("@/lib/search-events", () => ({
  trackSearchEvent: () => {},
}));

vi.mock("@/lib/player-theater", () => ({
  readStoredTheater: () => false,
  serverTheater: () => false,
  subscribeTheater: () => () => {},
}));

vi.mock("@/lib/api/video-config", () => ({
  getVideoConfigCached: () => new Promise(() => {}),
  resolveOptionLabel: (_o: unknown, v: string) => v,
}));

vi.mock("@/lib/api/playback-token-store", () => ({
  clearPlaybackToken: () => {},
  setPlaybackToken: () => {},
}));

vi.mock("@/lib/api", () => {
  class MockApiError extends Error {
    status = 500;
    code = "error";
  }
  return {
    ApiError: MockApiError,
    api: {
      getVideo: mocks.getVideo,
      getChannel: mocks.getChannel,
      getCaptions: mocks.getCaptions,
      getWatchProgress: mocks.getWatchProgress,
      recordWatchProgress: vi.fn(() => Promise.resolve()),
      recordVideoView: vi.fn(() => Promise.resolve()),
    },
    ipfsHlsMasterUrl: () => null,
    isSensitiveVideo: (v: object) => (v as { is_sensitive?: boolean }).is_sensitive === true,
    videoCaptionUrl: () => "",
    videoThumbnailUrl: () => "",
  };
});

// The player and every heavy watch-page child are stubbed: the gate branch
// renders INSTEAD of the player, so a visible player stub = gate open.
vi.mock("@/components/player/VideoPlayer", () => ({
  VideoPlayer: () => <div data-testid="player" />,
}));
vi.mock("@/components/AddToPlaylistButton", () => ({ AddToPlaylistButton: stub("playlist") }));
vi.mock("@/components/CommentsSection", () => ({ CommentsSection: stub("comments") }));
vi.mock("@/components/DownloadButton", () => ({ DownloadButton: stub("download") }));
vi.mock("@/components/KeyboardShortcutsHelp", () => ({ KeyboardShortcutsHelp: stub("kbd") }));
vi.mock("@/components/PrivacyBadge", () => ({ PrivacyBadge: stub("privacy") }));
vi.mock("@/components/RatingControls", () => ({ RatingControls: stub("rating") }));
vi.mock("@/components/RelatedVideos", () => ({ RelatedVideos: stub("related") }));
vi.mock("@/components/ReportButton", () => ({ ReportButton: stub("report") }));
vi.mock("@/components/SaveButton", () => ({ SaveButton: stub("save") }));
vi.mock("@/components/ShareButton", () => ({ ShareButton: stub("share") }));
vi.mock("@/components/SupportButton", () => ({ SupportButton: stub("support") }));
vi.mock("@/components/TimestampedText", () => ({ TimestampedText: stub("timestamped") }));
vi.mock("@/components/VideoActionsMenu", () => ({ VideoActionsMenu: stub("actions") }));
vi.mock("@/components/UpNextQueue", () => ({ UpNextQueue: stub("upnext") }));
vi.mock("@/components/watch/AmbientGlow", () => ({ AmbientGlow: stub("glow") }));
vi.mock("@/components/watch/IpfsPlayerOverlay", () => ({ IpfsPlayerOverlay: stub("ipfs-overlay") }));
vi.mock("@/components/watch/IpfsSourceBar", () => ({ IpfsSourceBar: stub("ipfs-bar") }));
vi.mock("@/components/watch/PasswordUnlockPanel", () => ({ PasswordUnlockPanel: stub("unlock") }));
vi.mock("@/components/watch/TranscodingNote", () => ({ TranscodingNote: stub("transcoding") }));
vi.mock("@/components/watch/WatchChannelCard", () => ({ WatchChannelCard: stub("channel") }));
vi.mock("@/components/watch/WatchSkeleton", () => ({ WatchSkeleton: stub("skeleton") }));
vi.mock("@/components/ui/EmptyState", () => ({ EmptyState: stub("empty") }));
vi.mock("@/components/ui/ErrorState", () => ({ ErrorState: stub("error") }));

import { WatchView } from "./WatchView";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    channel_handle: "ada",
    channel_display_name: "Ada",
    title: "Flagged clip",
    description: "",
    privacy: "public",
    state: "published",
    is_sensitive: true,
    sensitive_reason: "",
    created_at: "2026-07-13T12:00:00Z",
    has_thumbnail: false,
    views: 1,
    ...overrides,
  } as Video;
}

function renderWatch(v: Video) {
  mocks.getVideo.mockResolvedValue(v);
  mocks.getChannel.mockReturnValue(new Promise(() => {}));
  mocks.getCaptions.mockResolvedValue({ captions: [] });
  mocks.getWatchProgress.mockReturnValue(new Promise(() => {}));
  // The initialVideo seed renders the ready state synchronously.
  return render(<WatchView id="v1" initialVideo={v} />);
}

beforeEach(() => {
  mocks.policy = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WatchView sensitive gate", () => {
  it("gates a sensitive video under the hide policy (direct-link reachability)", () => {
    mocks.policy = "hide";
    renderWatch(video());

    expect(screen.getByText("This video contains sensitive content")).toBeTruthy();
    expect(screen.queryByTestId("player")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Watch anyway" }));
    expect(screen.getByTestId("player")).toBeTruthy();
    expect(screen.queryByText("This video contains sensitive content")).toBeNull();
  });

  it("shows the creator's content-warning text on the gate when set", () => {
    mocks.policy = "warn";
    renderWatch(video({ sensitive_reason: "Graphic surgery footage" }));

    expect(screen.getByText("This video contains sensitive content")).toBeTruthy();
    expect(screen.getByText("Graphic surgery footage")).toBeTruthy();
  });

  it("omits the reason line when the creator left it empty", () => {
    mocks.policy = "warn";
    renderWatch(video({ sensitive_reason: "" }));

    expect(screen.getByText("This video contains sensitive content")).toBeTruthy();
    // Only the generic explainer paragraph renders below the heading.
    expect(screen.queryByText(/Graphic/)).toBeNull();
  });

  it("plays immediately under display (no gate)", () => {
    mocks.policy = "display";
    renderWatch(video());

    expect(screen.queryByText("This video contains sensitive content")).toBeNull();
    expect(screen.getByTestId("player")).toBeTruthy();
  });
});
