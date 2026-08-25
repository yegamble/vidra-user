// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { clearPlaybackToken, getPlaybackToken } from "@/lib/api/playback-token-store";
import type { PlaybackSession } from "@/lib/api/types";

import {
  PLAYBACK_SESSION_WAIT_MS,
  playbackMasterUrl,
  usePlaybackSession,
  videoNeedsPlaybackToken,
} from "./playback-session";

const VIDEO_ID = "11111111-1111-1111-1111-111111111111";

const SESSION: PlaybackSession = {
  session_id: "22222222-2222-2222-2222-222222222222",
  video_id: VIDEO_ID,
  packaging_format: "cmaf",
  hls_url: "/api/v1/videos/v1/hls/master.m3u8?v=gen2",
  dash_url: "/api/v1/videos/v1/hls/cmaf/stream.mpd",
};

afterEach(() => {
  cleanup();
  clearPlaybackToken(VIDEO_ID);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("usePlaybackSession", () => {
  it("opens a video session and reports it ready", async () => {
    const post = vi.spyOn(api, "createVideoPlaybackSession").mockResolvedValue(SESSION);
    const { result } = renderHook(() => usePlaybackSession("video", VIDEO_ID));

    // Pending on the first render — the player must not start on the detail's
    // URL and swap when the session lands.
    expect(result.current.status).toBe("pending");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.session).toEqual(SESSION);
    expect(post).toHaveBeenCalledWith(VIDEO_ID, undefined, expect.any(AbortSignal));
  });

  it("forwards an unlock token so a password video can open its session", async () => {
    const post = vi.spyOn(api, "createVideoPlaybackSession").mockResolvedValue(SESSION);
    renderHook(() => usePlaybackSession("video", VIDEO_ID, "unlock-token"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith(VIDEO_ID, "unlock-token", expect.any(AbortSignal));
  });

  it("stores a token the server issued — and stores nothing when it issued none", async () => {
    vi.spyOn(api, "createVideoPlaybackSession").mockResolvedValue(SESSION);
    const plain = renderHook(() => usePlaybackSession("video", VIDEO_ID));
    await waitFor(() => expect(plain.result.current.status).toBe("ready"));
    // A public video's session carries no credential, and none is invented: a
    // token on an ordinary request would force no-store and block every
    // CDN/presign redirect.
    expect(getPlaybackToken(VIDEO_ID)).toBeNull();
    cleanup();

    vi.spyOn(api, "createVideoPlaybackSession").mockResolvedValue({
      ...SESSION,
      playback_token: "pt-session",
      expires_in: 21_600,
    });
    const locked = renderHook(() => usePlaybackSession("video", VIDEO_ID));
    await waitFor(() => expect(locked.result.current.status).toBe("ready"));
    // Into the SAME in-memory store the unlock flow uses — one token mechanism.
    expect(getPlaybackToken(VIDEO_ID)).toBe("pt-session");
  });

  it("degrades to unavailable when the session is refused — including 401", async () => {
    // The unlock prompt is driven by the DETAIL fetch, not by this call, so a
    // password_required here must leave the surface alone and simply not broker.
    vi.spyOn(api, "createVideoPlaybackSession").mockRejectedValue(
      new ApiError({ status: 401, code: "password_required", message: "locked" }),
    );
    const { result } = renderHook(() => usePlaybackSession("video", VIDEO_ID));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.session).toBeNull();
  });

  it("stops waiting at the deadline so a hung API cannot hold playback open", async () => {
    vi.useFakeTimers();
    // A request that never settles — the shape of an API that is up but wedged.
    vi.spyOn(api, "createVideoPlaybackSession").mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePlaybackSession("video", VIDEO_ID));
    expect(result.current.status).toBe("pending");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYBACK_SESSION_WAIT_MS);
    });
    expect(result.current.status).toBe("unavailable");
  });

  it("drops a session that lands after the player is gone, token and all", async () => {
    // The store is cleared by the surface's navigate-away cleanup. A token
    // written after that would sit there for a video nobody is watching, which
    // is exactly what the in-memory store's lifetime exists to prevent.
    let release: (session: PlaybackSession) => void = () => {};
    vi.spyOn(api, "createVideoPlaybackSession").mockReturnValue(
      new Promise<PlaybackSession>((resolve) => {
        release = resolve;
      }),
    );
    const { unmount } = renderHook(() => usePlaybackSession("video", VIDEO_ID));
    unmount();

    await act(async () => {
      release({ ...SESSION, playback_token: "pt-late" });
    });
    expect(getPlaybackToken(VIDEO_ID)).toBeNull();
  });

  it("asks for nothing when there is no subject to broker (a federated video)", () => {
    const video = vi.spyOn(api, "createVideoPlaybackSession");
    const live = vi.spyOn(api, "createLivePlaybackSession");
    const { result } = renderHook(() => usePlaybackSession(null, "remote-1"));
    expect(result.current.status).toBe("unavailable");
    expect(video).not.toHaveBeenCalled();
    expect(live).not.toHaveBeenCalled();
  });

  it("re-opens against the new subject on navigation, never reusing the old answer", async () => {
    const post = vi
      .spyOn(api, "createVideoPlaybackSession")
      .mockImplementation((id: string) =>
        Promise.resolve({ ...SESSION, video_id: id, hls_url: `/hls/${id}.m3u8` }),
      );
    const { result, rerender } = renderHook(({ id }) => usePlaybackSession("video", id), {
      initialProps: { id: "video-a" },
    });
    await waitFor(() => expect(result.current.session?.hls_url).toBe("/hls/video-a.m3u8"));

    rerender({ id: "video-b" });
    // Back to pending in the SAME render the id changed — one render answering
    // for the previous video would hand the player the wrong master.
    expect(result.current.status).toBe("pending");
    expect(result.current.session).toBeNull();
    await waitFor(() => expect(result.current.session?.hls_url).toBe("/hls/video-b.m3u8"));
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("opens a LIVE session from the live endpoint, with no token to forward", async () => {
    const post = vi.spyOn(api, "createLivePlaybackSession").mockResolvedValue({
      session_id: SESSION.session_id,
      live_stream_id: "33333333-3333-3333-3333-333333333333",
      packaging_format: "hls-ts",
      hls_url: "/api/v1/live/s1/hls/master.m3u8",
    });
    const { result } = renderHook(() => usePlaybackSession("live", "s1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(post).toHaveBeenCalledWith("s1", expect.any(AbortSignal));
    expect(result.current.session?.video_id).toBeUndefined();
  });
});

// Which plays may begin before the session answers. This predicate is the whole
// of that decision, and it has to keep saying the same thing as the server's
// videoRequiresPlaybackToken (httpapi/playback_session.go) — widening it costs a
// wait on every play it starts matching, narrowing it breaks playback outright.
describe("videoNeedsPlaybackToken", () => {
  it("is the password tier and nothing else", () => {
    expect(videoNeedsPlaybackToken({ privacy: "password" })).toBe(true);
    // Every other tier is gated on account identity, which the media element's
    // own request already carries in the session cookie.
    expect(videoNeedsPlaybackToken({ privacy: "public" })).toBe(false);
    expect(videoNeedsPlaybackToken({ privacy: "unlisted" })).toBe(false);
    expect(videoNeedsPlaybackToken({ privacy: "private" })).toBe(false);
  });

  it("does not guess when the detail said nothing about privacy", () => {
    // A remote/partial card carries no privacy. Absent is not "password": a
    // federated video is not brokered here and has no token to wait for.
    expect(videoNeedsPlaybackToken({})).toBe(false);
    expect(videoNeedsPlaybackToken({ privacy: null })).toBe(false);
  });

  it("treats an unlock token as proof of the password tier, whatever privacy says", () => {
    // Holding a video-scoped token means the viewer came through the unlock
    // flow. Erring towards the wait costs a round trip; erring the other way
    // starts a credentialed video with no credential.
    expect(videoNeedsPlaybackToken({}, "pt-unlock")).toBe(true);
    expect(videoNeedsPlaybackToken({ privacy: "public" }, "pt-unlock")).toBe(true);
    expect(videoNeedsPlaybackToken({ privacy: "public" }, null)).toBe(false);
    expect(videoNeedsPlaybackToken({ privacy: "public" }, "")).toBe(false);
  });
});

describe("playbackMasterUrl", () => {
  it("lets a ready session answer — the detail is no longer consulted", () => {
    expect(
      playbackMasterUrl({ status: "ready", session: SESSION }, "/detail/master.m3u8"),
    ).toBe(SESSION.hls_url);
  });

  it("treats a ready session with no manifest as a real answer: there is no tree", () => {
    const noTree: PlaybackSession = { ...SESSION, hls_url: undefined };
    expect(playbackMasterUrl({ status: "ready", session: noTree }, "/detail/master.m3u8")).toBe(
      undefined,
    );
  });

  it("falls back to the detail when no session arrived — the pre-session behaviour", () => {
    expect(
      playbackMasterUrl({ status: "unavailable", session: null }, "/detail/master.m3u8"),
    ).toBe("/detail/master.m3u8");
    expect(playbackMasterUrl({ status: "unavailable", session: null }, undefined)).toBe(
      undefined,
    );
  });
});
