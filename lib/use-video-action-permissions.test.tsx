// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    status: "authed",
    user: { id: "user-1", role: "user" },
  } as {
    status: "restoring" | "anon" | "authed";
    user: { id: string; role: "user" | "moderator" | "admin" } | null;
  },
  getMyChannels: vi.fn(),
  getInstanceCached: vi.fn(),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.session,
}));

vi.mock("@/lib/api", () => ({
  api: { getMyChannels: mocks.getMyChannels },
  getInstanceCached: mocks.getInstanceCached,
}));

import type { Video } from "@/lib/api";
import {
  resetVideoActionPermissionCacheForTests,
  useVideoActionPermissions,
} from "@/lib/use-video-action-permissions";

function video(channelId = "channel-1", overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    channel_id: channelId,
    title: "Policy test video",
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Video;
}

beforeEach(() => {
  resetVideoActionPermissionCacheForTests();
  mocks.session = {
    status: "authed",
    user: { id: "user-1", role: "user" },
  };
  mocks.getMyChannels.mockResolvedValue({ channels: [] });
  mocks.getInstanceCached.mockResolvedValue({ features: { downloads: false } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetVideoActionPermissionCacheForTests();
});

describe("useVideoActionPermissions", () => {
  it("enables downloads for ordinary viewers when the instance setting is on", async () => {
    mocks.getInstanceCached.mockResolvedValue({ features: { downloads: true } });
    const { result } = renderHook(() => useVideoActionPermissions(video()));

    await waitFor(() => expect(result.current.canDownload).toBe(true));
    expect(result.current.privileged).toBe(false);
    expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1);
  });

  it("keeps downloads hidden for an ordinary non-owner when the setting is off", async () => {
    const { result } = renderHook(() => useVideoActionPermissions(video()));

    await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    expect(result.current.canDownload).toBe(false);
    expect(result.current.canManage).toBe(false);
  });

  it.each(["moderator", "admin"] as const)(
    "lets a %s manage and download local videos even when downloads are disabled",
    async (role) => {
      mocks.session = { status: "authed", user: { id: `${role}-1`, role } };
      const { result } = renderHook(() => useVideoActionPermissions(video()));

      expect(result.current).toEqual({
        signedIn: true,
        privileged: true,
        canManage: true,
        canDownload: true,
      });
      await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1));
      expect(mocks.getMyChannels).not.toHaveBeenCalled();
    },
  );

  it("grants the owner capability used by both Manage and Delete", async () => {
    mocks.getMyChannels.mockResolvedValue({ channels: [{ id: "owned-channel" }] });
    const { result } = renderHook(() => useVideoActionPermissions(video("owned-channel")));

    await waitFor(() => expect(result.current.canManage).toBe(true));
    expect(result.current.canDownload).toBe(false);
    expect(mocks.getMyChannels).toHaveBeenCalledTimes(1);
  });

  it("denies Manage and Delete to a signed-in non-owner", async () => {
    mocks.getMyChannels.mockResolvedValue({ channels: [{ id: "someone-elses-channel" }] });
    const { result } = renderHook(() => useVideoActionPermissions(video("owned-channel")));

    await waitFor(() => expect(mocks.getMyChannels).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    expect(result.current.canManage).toBe(false);
  });

  it("shares the ownership request until the cache is reset, then fetches it again", async () => {
    mocks.getMyChannels.mockResolvedValue({ channels: [{ id: "owned-channel" }] });

    const first = renderHook(() => useVideoActionPermissions(video("owned-channel")));
    await waitFor(() => expect(first.result.current.canManage).toBe(true));
    const second = renderHook(() => useVideoActionPermissions(video("owned-channel")));
    await waitFor(() => expect(second.result.current.canManage).toBe(true));
    expect(mocks.getMyChannels).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
    resetVideoActionPermissionCacheForTests();

    const third = renderHook(() => useVideoActionPermissions(video("owned-channel")));
    await waitFor(() => expect(third.result.current.canManage).toBe(true));
    expect(mocks.getMyChannels).toHaveBeenCalledTimes(2);
  });
});
