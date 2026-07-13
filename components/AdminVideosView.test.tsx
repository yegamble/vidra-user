// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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

const local = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Local film",
  privacy: "private" as const,
  state: "published" as const,
  channel_handle: "ada",
  channel_display_name: "Ada Films",
  views: 9,
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
  mocks.getAdminVideos.mockResolvedValue({ videos: [local, remote], limit: 100, offset: 0 });
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
});
