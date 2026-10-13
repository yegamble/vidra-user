// @vitest-environment jsdom
//
// The playlist embed (/embed/playlists/[id]): route params, server-driven
// skipping, next/previous, auto-advance on end, paging past the first 20, and
// the private-playlist error state.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  getVideoEmbedPrivacy: vi.fn(),
  getVideo: vi.fn(),
}));

vi.mock("@/components/player/VideoPlayer", () => ({
  VideoPlayer: ({
    video,
    videoRef,
    children,
  }: {
    video: { id: string };
    videoRef: React.RefObject<HTMLVideoElement>;
    children: React.ReactNode;
  }) => (
    <div data-testid="player" data-video={video.id}>
      <video ref={videoRef} data-testid="media" />
      {children}
    </div>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/watch/PasswordUnlockPanel", () => ({ PasswordUnlockPanel: () => null }));
vi.mock("@/lib/use-settled-session", () => ({ useSettledSession: () => ({ settled: true, viewerKey: "anon" }) }));
vi.mock("@/lib/api", () => ({
  api: mocks,
  ApiError: class MockApiError extends Error {
    constructor(
      public status: number,
      public code: string,
    ) {
      super(code);
    }
  },
}));

import { ApiError } from "@/lib/api";
import { PlaylistEmbedPlayer } from "./PlaylistEmbedPlayer";

const refusal = (status: number, code: string) =>
  new (ApiError as unknown as new (s: number, c: string) => Error)(status, code);

const makeVideos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}`, title: `Title ${i + 1}` }));

// A server holding `n` visible items that answers by window, like the real one.
function serve(n: number, visibility = "public") {
  const all = makeVideos(n);
  mocks.getPlaylist.mockImplementation(async (_id: string, w: { limit?: number; offset?: number } = {}) => {
    const offset = w.offset ?? 0;
    const limit = w.limit ?? 20;
    return { title: "Mix", visibility, videos: all.slice(offset, offset + limit), total: n, limit, offset };
  });
}

const playing = () => screen.getByTestId("player").getAttribute("data-video");
const settle = () => act(async () => {});

function open(search = "") {
  window.history.replaceState(null, "", `/embed/playlists/p1${search}`);
  render(<PlaylistEmbedPlayer id="p1" />);
  return settle();
}

beforeEach(() => {
  mocks.getVideoEmbedPrivacy.mockResolvedValue({ status: "open", allowed_domains: [] });
  mocks.getVideo.mockImplementation(async (id: string) => ({ id, title: `Title ${id.slice(1)}` }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlaylistEmbedPlayer", () => {
  it("starts at the first item with the title and n / total", async () => {
    serve(3);
    await open();
    expect(playing()).toBe("v1");
    expect(mocks.getPlaylist.mock.calls[0][0]).toBe("p1");
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous video" })).toHaveProperty("disabled", true);
  });

  it("honours PeerTube's 1-based playlistPosition", async () => {
    serve(5);
    await open("?playlistPosition=3");
    expect(playing()).toBe("v3");
    expect(screen.getByText("3 / 5")).toBeTruthy();
  });

  it("pages to a position beyond the first page", async () => {
    serve(45);
    await open("?playlistPosition=41");
    await settle();
    expect(playing()).toBe("v41");
    expect(mocks.getPlaylist.mock.calls.map((c) => (c[1] as { offset: number }).offset)).toContain(20);
    expect(screen.getByText("41 / 45")).toBeTruthy();
  });

  it("moves with next and previous", async () => {
    serve(3);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Next video" }));
    await settle();
    expect(playing()).toBe("v2");
    fireEvent.click(screen.getByRole("button", { name: "Previous video" }));
    await settle();
    expect(playing()).toBe("v1");
  });

  it("advances when a video ends, and stays on the last one", async () => {
    serve(2);
    await open();
    fireEvent(screen.getByTestId("media"), new Event("ended"));
    await settle();
    expect(playing()).toBe("v2");
    fireEvent(screen.getByTestId("media"), new Event("ended"));
    await settle();
    expect(playing()).toBe("v2");
    expect(screen.getByRole("button", { name: "Next video" })).toHaveProperty("disabled", true);
  });

  it("wraps to the head at the end only when loop=1", async () => {
    serve(2);
    await open("?loop=1&playlistPosition=2");
    fireEvent(screen.getByTestId("media"), new Event("ended"));
    await settle();
    expect(playing()).toBe("v1");
  });

  it("skips an item the server refuses and one whose embedding is disabled", async () => {
    serve(4);
    mocks.getVideo.mockImplementation(async (id: string) => {
      if (id === "v2") throw refusal(404, "not_found");
      return { id, title: id };
    });
    mocks.getVideoEmbedPrivacy.mockImplementation(async (id: string) => ({
      status: id === "v3" ? "disabled" : "open",
      allowed_domains: [],
    }));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Next video" }));
    await settle();
    await settle();
    expect(playing()).toBe("v4");
  });

  it("says so when nothing in the playlist can play", async () => {
    serve(2);
    mocks.getVideo.mockRejectedValue(refusal(404, "not_found"));
    await open();
    await settle();
    await settle();
    expect(screen.getByText("No video in this playlist can be played here.")).toBeTruthy();
  });

  it("shows the video embed's 'not available' state for a private playlist", async () => {
    serve(3, "private");
    await open();
    expect(screen.getByText("This playlist is not available.")).toBeTruthy();
    expect(screen.queryByTestId("player")).toBeNull();
  });

  it("treats a 404 as not available", async () => {
    mocks.getPlaylist.mockRejectedValue(refusal(404, "not_found"));
    await open();
    expect(screen.getByText("This playlist is not available.")).toBeTruthy();
  });

  it("reports an empty playlist", async () => {
    serve(0);
    await open();
    expect(screen.getByText("This playlist has no videos.")).toBeTruthy();
  });
});
