// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminVideos: vi.fn(),
  runVideoTranscoding: vi.fn(),
  requestAutoCaption: vi.fn(),
  blockVideo: vi.fn(),
  unblockVideo: vi.fn(),
  blockRemoteVideo: vi.fn(),
  unblockRemoteVideo: vi.fn(),
  deleteVideo: vi.fn(),
  push: vi.fn(),
}));

// The list state lives in the URL now, so the stub must re-render on navigation
// or "did paging refetch" would only be measuring the stub.
vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/lib/test-navigation");
  return { ...navigationMock, useRouter: () => ({ ...navigationMock.useRouter(), push: mocks.push }) };
});
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  api: {
    getAdminVideos: mocks.getAdminVideos,
    runVideoTranscoding: mocks.runVideoTranscoding,
    requestAutoCaption: mocks.requestAutoCaption,
    blockVideo: mocks.blockVideo,
    unblockVideo: mocks.unblockVideo,
    blockRemoteVideo: mocks.blockRemoteVideo,
    unblockRemoteVideo: mocks.unblockRemoteVideo,
    deleteVideo: mocks.deleteVideo,
  },
  errorMessage: (_error: unknown, fallback: string) => fallback,
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  remoteVideoThumbnailUrl: (id: string) => `/remote-videos/${id}/thumbnail`,
}));

import { AdminVideosView } from "@/components/AdminVideosView";
import { ToastProvider } from "@/components/ui";
import { navigation } from "@/lib/test-navigation";

const local = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Local film",
  privacy: "private" as const,
  state: "published" as const,
  channel_handle: "ada",
  channel_display_name: "Ada Films",
  views: 9,
  likes: 4,
  comments: 2,
  published_at: "2026-07-13T12:00:00Z",
  duration_seconds: 305,
  is_local: true,
  sensitive: true,
  external_link: true,
  has_thumbnail: true,
  has_original: true,
  hls_count: 3,
  web_video_count: 2,
  object_storage: true,
  size_bytes: 100_000_000,
  blocked: false,
};

const remote = {
  ...local,
  id: "22222222-2222-2222-2222-222222222222",
  title: "Federated film",
  privacy: "public" as const,
  channel_handle: "films@remote.example",
  channel_display_name: "films",
  is_local: false,
  origin_domain: "remote.example",
  watch_url: "https://remote.example/w/film",
  sensitive: false,
  external_link: false,
  has_original: false,
  hls_count: 0,
  web_video_count: 0,
  object_storage: false,
  size_bytes: 0,
};

beforeEach(() => {
  navigation.reset("/moderation/videos");
  // 4649 is deliberately NOT the row count: the header must read the server's
  // total, which is the whole point of this contract change.
  mocks.getAdminVideos.mockResolvedValue({
    videos: [local, remote],
    total: 4649,
    limit: 20,
    offset: 0,
  });
  mocks.runVideoTranscoding.mockResolvedValue({ status: "queued" });
  mocks.requestAutoCaption.mockResolvedValue({ caption_job: { state: "pending" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminVideosView", () => {
  it("renders PeerTube-style inventory facts and recovery actions", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);

    expect(await screen.findByText("Local film")).toBeTruthy();
    expect(screen.getByText("Federated film")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.getByText("Federated")).toBeTruthy();
    expect(screen.getByText("Sensitive")).toBeTruthy();
    expect(screen.getByText("External link")).toBeTruthy();
    expect(screen.getByText("Original")).toBeTruthy();
    expect(screen.getByText("HLS (3)")).toBeTruthy();
    expect(screen.getByText("Web Videos (2)")).toBeTruthy();
    expect(screen.getByText("Object storage")).toBeTruthy();
    expect(screen.getByText("remote.example")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Local film" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Manage",
      "Block",
      "Delete",
      "Run HLS transcoding",
      "Run Web Video transcoding",
      "Generate caption",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Run Web Video transcoding" }));
    await waitFor(() =>
      expect(mocks.runVideoTranscoding).toHaveBeenCalledWith(local.id, "web_video"),
    );
  });

  it("counts the instance, not the page — the reported bug", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    // Two rows on screen, 4,649 on the instance. This line used to read "2".
    expect(await screen.findByText("4649 videos")).toBeTruthy();
    // And it asks for a real window rather than a fixed limit: 100 with no offset.
    expect(mocks.getAdminVideos.mock.calls[0][0]).toMatchObject({ limit: 20, offset: 0 });
  });

  it("pages forward with a real offset and remembers it in the URL", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(navigation.lastUrl()).toBe("/moderation/videos?offset=20");
    await waitFor(() =>
      expect(mocks.getAdminVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({ offset: 20 }),
        expect.anything(),
      ),
    );
  });

  it("lets the operator change the page size", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");

    fireEvent.change(screen.getByRole("combobox", { name: "Rows per page" }), {
      target: { value: "50" },
    });
    expect(navigation.lastUrl()).toBe("/moderation/videos?limit=50");
    await waitFor(() =>
      expect(mocks.getAdminVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50 }),
        expect.anything(),
      ),
    );
  });

  it("has a Transcoding preset that asks for both in-flight states", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");

    fireEvent.click(screen.getByRole("button", { name: "Transcoding" }));
    expect(navigation.params().get("state")).toBe("processing,transcoding");
    await waitFor(() =>
      expect(mocks.getAdminVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: ["processing", "transcoding"] }),
        expect.anything(),
      ),
    );
  });

  it("can ask for videos that have NO HLS — the query a checkbox would delete", async () => {
    navigation.reset("/moderation/videos", "hls=false");
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");

    expect(mocks.getAdminVideos.mock.calls[0][0]).toMatchObject({ hasHls: false });
  });

  it("treats an absent tri-state as 'all', not as false", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");
    const params = mocks.getAdminVideos.mock.calls[0][0];
    expect(params.hasHls).toBeUndefined();
    expect(params.hasOriginal).toBeUndefined();
    expect(params.hasWebFiles).toBeUndefined();
  });

  it("refuses an inverted publish window instead of requesting a 400", async () => {
    navigation.reset("/moderation/videos", "after=2026-08-01T00:00&before=2026-07-01T00:00");
    render(<ToastProvider><AdminVideosView /></ToastProvider>);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("ends before it starts"),
    );
    expect(mocks.getAdminVideos).not.toHaveBeenCalled();
  });

  it("offers no storage filter — the backend has no per-file truth behind one", async () => {
    render(<ToastProvider><AdminVideosView /></ToastProvider>);
    await screen.findByText("Local film");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("group", { name: "Filters" });
    // The "Object storage" pill still appears on a row; what must not exist is a
    // control to filter on it, since every local row reports the same value.
    expect(within(panel).queryByText(/storage/i)).toBeNull();
  });
});
