// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RemoteVideo, RemoteVideoCommentListResponse } from "@/lib/api";

// A29 remediation, the follower's half: the origin now advertises a playable
// HLS master on its AS Video, so a federated video must render THIS instance's
// own player against it rather than a link-out.
//
// The fixture is typed as the contract's own RemoteVideo — the type is derived
// from api/openapi.yaml's schema, so a field that leaves or changes shape in
// core breaks this file at compile time rather than passing against a hand-made
// object. That is the whole reason it is typed rather than cast: a mocked test
// against an invented shape is exactly how a feature stays green while being
// unreachable in production.

const mocks = vi.hoisted(() => ({
  getRemoteVideo: vi.fn(),
  getRemoteVideoComments: vi.fn(),
  useSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getRemoteVideo: mocks.getRemoteVideo,
      getRemoteVideoComments: mocks.getRemoteVideoComments,
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.useSession(),
}));

import { RemoteWatchView } from "./RemoteWatchView";

const HLS_MASTER = "https://peer.example/api/v1/videos/7a1d9e42-0000-4000-8000-000000000001/hls/master.m3u8";

function remoteVideo(overrides: Partial<RemoteVideo> = {}): RemoteVideo {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    remote: true,
    domain: "peer.example",
    title: "Dawn over the fjord",
    description: "A quiet opening.",
    object_url: "https://peer.example/videos/7a1d9e42-0000-4000-8000-000000000001",
    watch_url: "https://peer.example/v/abcdefghijk",
    has_thumbnail: true,
    duration_seconds: 367,
    published_at: "2026-08-30T08:00:00Z",
    ...overrides,
  };
}

// jsdom has no MSE and its canPlayType answers "" for everything, so an HLS
// master is unplayable there by default and the page would honestly show its
// link-out panel — which would make this file prove nothing about the case the
// whole slice is about. Reporting native HLS support is what a Safari-class
// browser actually does, and it makes the REAL engine selection choose the
// native path and attach the origin's master playlist to a real <video>. The
// hls.js branch cannot be exercised under jsdom at all; lib/remote-playback and
// lib/player-engine cover the selection for it.
function pretendNativeHlsSupport() {
  const proto = window.HTMLMediaElement.prototype;
  const original = proto.canPlayType;
  proto.canPlayType = function canPlayType(type: string) {
    return type === "application/vnd.apple.mpegurl" ? "maybe" : "";
  };
  return () => {
    proto.canPlayType = original;
  };
}

let restoreCanPlayType: (() => void) | null = null;

beforeEach(() => {
  mocks.getRemoteVideo.mockReset();
  mocks.getRemoteVideoComments
    .mockReset()
    .mockResolvedValue({ comments: [], total: 0, limit: 50, offset: 0 });
  mocks.useSession.mockReturnValue({ status: "anonymous" });
});

afterEach(() => {
  restoreCanPlayType?.();
  restoreCanPlayType = null;
  cleanup();
});

describe("RemoteWatchView playback", () => {
  it("renders a player against the origin's stream when the object advertises one", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    const player = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    // The ORIGIN's master playlist, cross-origin, on this instance's own player
    // — which is only reachable because the origin now answers it with
    // `Access-Control-Allow-Origin: *` (the core half of this slice).
    expect(player.getAttribute("src")).toBe(HLS_MASTER);
    expect(screen.queryByText(/can’t be played here/)).toBeNull();
  });

  it("keeps the watch-on-origin link even when it can play the stream itself", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);

    const link = await screen.findByRole("link", { name: /Watch on peer\.example/ });
    expect(link.getAttribute("href")).toBe("https://peer.example/v/abcdefghijk");
  });

  it("falls back to the honest panel when the origin advertised no stream", async () => {
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo());
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByText(/can’t be played here/);
    expect(container.querySelector("video")).toBeNull();
    expect(
      await screen.findByRole("link", { name: /Watch on peer\.example/ }),
    ).toBeTruthy();
  });

  it("plays a direct video file too, the other shape the object can advertise", async () => {
    const mp4 = "https://peer.example/api/v1/videos/7a1d9e42-0000-4000-8000-000000000001/original";
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: mp4 }));
    const { container } = render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    const player = await waitFor(() => {
      const el = container.querySelector("video");
      expect(el).not.toBeNull();
      return el as HTMLVideoElement;
    });
    expect(player.getAttribute("src")).toBe(mp4);
  });

  it("shows the origin badge and duration from the federated object", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);

    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.getByText("6:07")).toBeTruthy();
  });

  it("offers instance moderation only to a signed-in viewer", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.queryByRole("button", { name: /Mute instance/ })).toBeNull();

    cleanup();
    mocks.useSession.mockReturnValue({ status: "authed" });
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Dawn over the fjord" });
    expect(screen.getByRole("button", { name: /Mute instance peer\.example/ })).toBeTruthy();
  });
});

describe("RemoteWatchView mirrored thread", () => {
  it("renders the comments the origin sent, with each author's own domain", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    mocks.getRemoteVideoComments.mockResolvedValue({
      comments: [
        {
          id: "c1",
          author_name: "ada",
          author_domain: "peer.example",
          actor_url: "https://peer.example/accounts/ada",
          object_url: "https://peer.example/notes/1",
          body: "Beautiful grade.",
          edited: false,
          created_at: "2026-09-05T10:00:00Z",
        },
        {
          id: "c2",
          author_name: "ada",
          author_domain: "other.example",
          actor_url: "https://other.example/accounts/ada",
          object_url: "https://other.example/notes/2",
          body: "Agreed.",
          edited: true,
          created_at: "2026-09-05T11:00:00Z",
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    } satisfies RemoteVideoCommentListResponse);

    render(<RemoteWatchView id="r1" />);
    expect(await screen.findByText("Beautiful grade.")).toBeTruthy();
    expect(screen.getByText("Agreed.")).toBeTruthy();
    // Two authors called "ada" on different servers must be distinguishable.
    expect(screen.getAllByText("ada")).toHaveLength(2);
    // peer.example appears more than once (the card's own origin badge and the
    // "Watch on …" link), so the assertion is that BOTH domains are present in
    // the thread, not how many times each occurs on the page.
    expect(screen.getAllByText(/peer\.example/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/other\.example/).length).toBeGreaterThan(0);
    // An origin can rewrite a comment under a reader; the thread says so.
    expect(screen.getByText(/edited/)).toBeTruthy();
  });

  it("explains an empty thread rather than implying the video has no comments", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    expect(await screen.findByText(/mirrors the comments its origin sends it/)).toBeTruthy();
  });

  it("offers no composer — replying lives on the origin", async () => {
    restoreCanPlayType = pretendNativeHlsSupport();
    mocks.getRemoteVideo.mockResolvedValue(remoteVideo({ stream_url: HLS_MASTER }));
    render(<RemoteWatchView id="r1" />);
    await screen.findByRole("heading", { name: "Comments from the origin" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/so does replying/)).toBeTruthy();
  });
});
