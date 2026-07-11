// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/VideoActionsMenu", () => ({
  VideoActionsMenu: ({
    video,
    onDeleted,
  }: {
    video: { title: string };
    onDeleted?: () => void;
  }) => (
    <button type="button" aria-label={`Actions for ${video.title}`} onClick={onDeleted}>
      Actions
    </button>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    listChannelVideos: vi.fn(),
    getFeed: vi.fn(),
  },
  remoteVideoThumbnailUrl: (id: string) => `/remote/${id}/thumbnail`,
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
}));

import { api, type Video } from "@/lib/api";
import { RelatedVideos } from "@/components/RelatedVideos";

const listChannelVideos = vi.mocked(api.listChannelVideos);
const getFeed = vi.mocked(api.getFeed);

function video(id: string, title: string): Video {
  return {
    id,
    channel_id: "channel-1",
    channel_handle: "film-house",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: false,
  } as Video;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RelatedVideos video actions", () => {
  it("removes a deleted related row and clears the reported next video", async () => {
    const current = video("current", "Current video");
    const next = video("next", "Related video");
    const onFirstRelated = vi.fn();
    listChannelVideos.mockResolvedValue({ videos: [current, next] } as never);
    getFeed.mockResolvedValue({ videos: [] } as never);

    render(<RelatedVideos video={current} onFirstRelated={onFirstRelated} />);

    fireEvent.click(await screen.findByRole("button", { name: "Actions for Related video" }));
    expect(screen.queryByRole("heading", { name: "Related video" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Related videos" })).toBeNull();
    await waitFor(() => expect(onFirstRelated).toHaveBeenLastCalledWith(null));
  });
});
