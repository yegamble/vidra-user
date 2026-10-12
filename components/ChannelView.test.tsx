// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChannel: vi.fn(),
  listChannelVideos: vi.fn(),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon", user: null }),
}));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getChannel: mocks.getChannel, listChannelVideos: mocks.listChannelVideos },
}));
vi.mock("@/lib/use-viewer-moderation", () => ({
  useViewerModeration: () => ({ mutedIds: new Set(), blockedIds: new Set() }),
}));
vi.mock("@/components/AccountModerationMenu", () => ({ AccountModerationMenu: () => null }));
vi.mock("@/components/FollowButton", () => ({ FollowButton: () => null }));
vi.mock("@/components/ChannelLiveBadge", () => ({ ChannelLiveBadge: () => null }));
vi.mock("@/components/MessageButton", () => ({ MessageButton: () => null }));
// A spy, so the wiring of the channel's support text into the button is observable.
const supportButton = vi.hoisted(() => vi.fn());
vi.mock("@/components/SupportButton", () => ({
  SupportButton: (props: { text?: string | null }) => {
    supportButton(props);
    return null;
  },
}));
vi.mock("@/components/ChannelVideoCard", () => ({
  ChannelVideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));

import { ChannelView } from "./ChannelView";

const channel = {
  id: "c1",
  owner_id: "creator",
  handle: "creator",
  display_name: "Creator",
  description: "",
  created_at: "2026-09-05T00:00:00Z",
  follower_count: 1,
};

function videos(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${from + i}`,
    title: `Video ${from + i}`,
    created_at: "2026-09-06T00:00:00Z",
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getChannel.mockResolvedValue(channel);
});
afterEach(cleanup);

describe("ChannelView paging", () => {
  it("requests page 2 at offset 20, appends it, and drops Load more at the total", async () => {
    mocks.listChannelVideos.mockImplementation(
      (_h: string, _t: unknown, _s: unknown, p: { offset?: number }) =>
        Promise.resolve(
          p.offset
            ? { videos: videos(20, 5), total: 25, limit: 20, offset: 20 }
            : { videos: videos(0, 20), total: 25, limit: 20, offset: 0 },
        ),
    );
    render(<ChannelView handle="creator" />);
    expect(await screen.findByText("Video 0")).toBeTruthy();
    expect(screen.queryByText("Video 20")).toBeNull();
    expect(screen.getByText(/25 videos/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Video 24")).toBeTruthy();
    expect(screen.getByText("Video 0")).toBeTruthy();
    expect(mocks.listChannelVideos).toHaveBeenLastCalledWith(
      "creator",
      undefined,
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 20, sort: "-published_at" }),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("asks the server for oldest-first and restarts from page one on a sort change", async () => {
    mocks.listChannelVideos.mockImplementation(
      (_h: string, _t: unknown, _s: unknown, p: { sort?: string }) =>
        Promise.resolve(
          p.sort === "published_at"
            ? { videos: videos(100, 3), total: 3, limit: 20, offset: 0 }
            : { videos: videos(0, 20), total: 45, limit: 20, offset: 0 },
        ),
    );
    render(<ChannelView handle="creator" />);
    await screen.findByText("Video 0");

    fireEvent.click(screen.getByRole("button", { name: "Oldest" }));
    expect(await screen.findByText("Video 100")).toBeTruthy();
    expect(screen.queryByText("Video 0")).toBeNull();
    await waitFor(() =>
      expect(mocks.listChannelVideos).toHaveBeenLastCalledWith(
        "creator",
        undefined,
        expect.anything(),
        expect.objectContaining({ offset: 0, sort: "published_at" }),
      ),
    );
  });
});

// PeerTube's channel "support" message rides the existing Support button.
describe("ChannelView support text", () => {
  it("hands the channel's support text to the Support button", async () => {
    supportButton.mockClear();
    mocks.getChannel.mockResolvedValue({ ...channel, support: "Ko-fi: creator" });
    mocks.listChannelVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 });
    render(<ChannelView handle="creator" />);
    await waitFor(() =>
      expect(supportButton).toHaveBeenCalledWith(expect.objectContaining({ text: "Ko-fi: creator" })),
    );
  });
});
