// @vitest-environment jsdom
//
// Theater mode must not REMOUNT the player.
//
// WatchView used to render the stage at two different tree positions — inside
// the primary column normally, hoisted to the top of the page in theater — and
// React reconciles by position. Pressing `T` therefore destroyed the <video>
// and its hls instance, restarted playback from 0, re-fired the start-on-open
// kick, re-showed the "Resume from…" offer mid-watch and reset the
// once-per-video view guard, so a second view was counted. The stage now has
// ONE position in both modes (a CSS grid-area swap), and this suite is what
// keeps it there.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mounts = vi.hoisted(() => ({ count: 0, unmounts: 0 }));

const mocks = vi.hoisted(() => ({
  policy: null as string | null,
  session: { user: null as { id: string } | null, status: "anon" },
  getVideoByCode: vi.fn(),
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
  useSession: () => mocks.session,
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
      getVideoByCode: mocks.getVideoByCode,
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
// A player that COUNTS ITS MOUNTS. The whole point of this suite: toggling
// theater must be a style change, never a remount of the media element.
vi.mock("@/components/player/VideoPlayer", async () => {
  const { useEffect } = await import("react");
  return {
    VideoPlayer: () => {
      useEffect(() => {
        mounts.count += 1;
        return () => {
          mounts.unmounts += 1;
        };
      }, []);
      return <div data-testid="player" />;
    },
  };
});
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
import { setTheater } from "@/lib/player-theater";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    channel_handle: "ada",
    channel_display_name: "Ada",
    title: "Theater clip",
    description: "",
    privacy: "public",
    state: "published",
    is_sensitive: false,
    sensitive_reason: "",
    created_at: "2026-07-13T12:00:00Z",
    has_thumbnail: false,
    views: 1,
    ...overrides,
  } as Video;
}

function renderWatch() {
  const v = video();
  mocks.getVideo.mockResolvedValue(v);
  mocks.getChannel.mockReturnValue(new Promise(() => {}));
  mocks.getCaptions.mockResolvedValue({ captions: [] });
  mocks.getWatchProgress.mockReturnValue(new Promise(() => {}));
  return render(<WatchView id="v1" initialVideo={v} />);
}

beforeEach(() => {
  mocks.policy = null;
  mocks.session = { user: null, status: "anon" };
  mounts.count = 0;
  mounts.unmounts = 0;
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe("WatchView theater toggle", () => {
  it("does not remount the player when theater is turned on and off", () => {
    renderWatch();
    const before = screen.getByTestId("player");
    expect(mounts.count).toBe(1);
    expect(mounts.unmounts).toBe(0);
    // Mark the node so identity is checked on the DOM too, not only by the
    // mount counter: a remount would hand back a different element.
    (before as HTMLElement & { __marker?: string }).__marker = "same-node";

    act(() => setTheater(true));
    const inTheater = screen.getByTestId("player");
    expect(inTheater).toBe(before);
    expect((inTheater as HTMLElement & { __marker?: string }).__marker).toBe("same-node");
    expect(mounts.count).toBe(1);
    expect(mounts.unmounts).toBe(0);

    act(() => setTheater(false));
    const back = screen.getByTestId("player");
    expect(back).toBe(before);
    expect((back as HTMLElement & { __marker?: string }).__marker).toBe("same-node");
    expect(mounts.count).toBe(1);
    expect(mounts.unmounts).toBe(0);
  });

  it("switches the layout by grid area, not by tree position", () => {
    const { container } = renderWatch();
    const root = container.querySelector("[data-theater]") as HTMLElement;
    const stage = container.querySelector(".watch-stage-area") as HTMLElement;
    expect(root.className).toContain("watch-layout");
    expect(root.className).not.toContain("watch-layout-theater");
    // The stage is the root's FIRST child in both modes.
    expect(root.firstElementChild).toBe(stage);

    act(() => setTheater(true));
    expect(root.className).toContain("watch-layout-theater");
    expect(container.querySelector(".watch-stage-area")).toBe(stage);
    expect(root.firstElementChild).toBe(stage);
  });
});
