// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video, VideoFeedResponse } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getFeed: vi.fn(),
  priorities: [] as boolean[],
}));

vi.mock("@/lib/api", () => ({ api: { getFeed: mocks.getFeed } }));
vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video, priority }: { video: Video; priority?: boolean }) => {
    mocks.priorities.push(priority === true);
    return <span>{video.title}</span>;
  },
}));
vi.mock("@/components/VideoGrid", () => ({
  VideoGrid: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
}));

import { VideoFeed } from "./VideoFeed";

function video(index: number): Video {
  return { id: `v${index}`, title: `Video ${index}` } as Video;
}

beforeEach(() => {
  mocks.getFeed.mockReset();
  mocks.priorities.length = 0;
});

afterEach(cleanup);

describe("VideoFeed server seed", () => {
  it("hydrates from the first page without a duplicate fetch and prioritizes one desktop row", () => {
    const initialPage = {
      total: 4,
      videos: [video(1), video(2), video(3), video(4)],
      sort: "recent",
      scope: "local",
      limit: 20,
      offset: 0,
    } satisfies VideoFeedResponse;

    render(
      <VideoFeed
        sort="recent"
        filters={{ scope: "local" }}
        initialPage={initialPage}
        prioritizeFirstRow
      />,
    );

    expect(screen.getByText("Video 1")).toBeTruthy();
    expect(screen.getByText("Video 4")).toBeTruthy();
    expect(mocks.getFeed).not.toHaveBeenCalled();
    expect(mocks.priorities).toEqual([true, true, true, false]);
  });
});
