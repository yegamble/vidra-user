// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  api: { searchVideos: vi.fn() },
  remoteVideoThumbnailUrl: (id: string) => `/remote/${id}/thumbnail`,
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  // The W5 miniature-name hook primes this shared fetch; rejecting keeps the
  // instance defaults null (today's channel attribution).
  getInstanceCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
}));

import { api, type Video } from "@/lib/api";
import { SearchResults } from "@/components/SearchResults";

const searchVideos = vi.mocked(api.searchVideos);

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

describe("SearchResults video actions", () => {
  it("renders an action menu for each result and removes a locally deleted row", async () => {
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByRole("heading", { name: "Search match" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Search match" }));

    expect(screen.queryByRole("heading", { name: "Search match" })).toBeNull();
    expect(screen.getByText("No results")).toBeTruthy();
  });
});
