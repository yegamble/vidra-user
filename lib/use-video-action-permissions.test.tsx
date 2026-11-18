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

  it("layers the per-video download policy on the instance setting (W9)", async () => {
    mocks.getInstanceCached.mockResolvedValue({ features: { downloads: true } });
    const { result } = renderHook(() =>
      useVideoActionPermissions(video("channel-1", { download_enabled: false })),
    );

    await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1));
    await act(async () => Promise.resolve());
    // Instance on + per-video off => no download for regular viewers.
    expect(result.current.canDownload).toBe(false);
  });

  it("treats an absent per-video flag as enabled (card payloads omit it)", async () => {
    mocks.getInstanceCached.mockResolvedValue({ features: { downloads: true } });
    const { result } = renderHook(() => useVideoActionPermissions(video()));

    await waitFor(() => expect(result.current.canDownload).toBe(true));
  });

  it("lets a moderator download even when the per-video flag is off", async () => {
    mocks.session = { status: "authed", user: { id: "mod-1", role: "moderator" } };
    mocks.getInstanceCached.mockResolvedValue({
      features: { downloads: true, downloads_anonymous: true, downloads_staff: true },
    });
    const { result } = renderHook(() =>
      useVideoActionPermissions(video("channel-1", { download_enabled: false })),
    );

    await waitFor(() => expect(result.current.canDownload).toBe(true));
  });

  it.each(["moderator", "admin"] as const)(
    "lets a %s manage and download local videos when both audience switches are off",
    async (role) => {
      mocks.session = { status: "authed", user: { id: `${role}-1`, role } };
      mocks.getInstanceCached.mockResolvedValue({
        features: { downloads: false, downloads_anonymous: false, downloads_staff: true },
      });
      const { result } = renderHook(() => useVideoActionPermissions(video()));

      await waitFor(() => expect(result.current.canDownload).toBe(true));
      expect(result.current).toEqual({
        signedIn: true,
        privileged: true,
        canManage: true,
        canDownload: true,
      });
      expect(mocks.getMyChannels).not.toHaveBeenCalled();
    },
  );

  it.each(["moderator", "admin"] as const)(
    "hides the download from a %s when the instance master switch is off",
    async (role) => {
      mocks.session = { status: "authed", user: { id: `${role}-1`, role } };
      mocks.getInstanceCached.mockResolvedValue({
        features: { downloads: false, downloads_anonymous: false, downloads_staff: false },
      });
      const { result } = renderHook(() => useVideoActionPermissions(video()));

      await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalledTimes(1));
      await act(async () => Promise.resolve());
      expect(result.current.canDownload).toBe(false);
      expect(result.current.canManage).toBe(true);
    },
  );

  it("follows the logged-out switch for a visitor and the signed-in switch for a member", async () => {
    mocks.getInstanceCached.mockResolvedValue({
      features: { downloads: true, downloads_anonymous: false, downloads_staff: true },
    });
    const member = renderHook(() => useVideoActionPermissions(video()));
    await waitFor(() => expect(member.result.current.canDownload).toBe(true));
    member.unmount();

    mocks.session = { status: "anon", user: null };
    const visitor = renderHook(() => useVideoActionPermissions(video()));
    await waitFor(() => expect(mocks.getInstanceCached).toHaveBeenCalledTimes(2));
    await act(async () => Promise.resolve());
    expect(visitor.result.current.canDownload).toBe(false);
  });

  it("reads a core without the audience flags as before: one switch, staff never off", async () => {
    mocks.getInstanceCached.mockResolvedValue({ features: { downloads: false } });
    mocks.session = { status: "authed", user: { id: "mod-1", role: "moderator" } };
    const staff = renderHook(() => useVideoActionPermissions(video()));
    await waitFor(() => expect(staff.result.current.canDownload).toBe(true));
    staff.unmount();

    mocks.getInstanceCached.mockResolvedValue({ features: { downloads: true } });
    mocks.session = { status: "anon", user: null };
    const visitor = renderHook(() => useVideoActionPermissions(video()));
    await waitFor(() => expect(visitor.result.current.canDownload).toBe(true));
  });


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
