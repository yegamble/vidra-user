// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getChannelStats: vi.fn(),
  listChannelVideos: vi.fn(),
  getVideoStats: vi.fn(),
  getMyStats: vi.fn(),
  studio: {
    channels: [] as unknown[],
    currentHandle: "alpha",
    currentChannel: { handle: "alpha", display_name: "Alpha", role: "owner" } as unknown,
    setCurrentHandle: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    getChannelStats: mocks.getChannelStats,
    listChannelVideos: mocks.listChannelVideos,
    getVideoStats: mocks.getVideoStats,
    getMyStats: mocks.getMyStats,
  },
}));

vi.mock("@/components/studio/StudioContext", () => ({
  useStudio: () => mocks.studio,
}));

vi.mock("@/components/StatsChart", () => ({
  StatsChart: ({ label }: { label: string }) => <div data-testid="chart">{label}</div>,
}));

import { AnalyticsView } from "@/components/studio/AnalyticsView";

const channel = (handle: string, name: string) => ({
  id: handle,
  handle,
  display_name: name,
  role: "owner",
});

function statsFor(views: number) {
  return {
    views,
    likes: 0,
    dislikes: 0,
    comments: 0,
    followers: 0,
    videos: 0,
    daily_views: [{ day: "2026-09-01", views }],
  };
}

beforeEach(() => {
  mocks.studio.channels = [channel("alpha", "Alpha"), channel("beta", "Beta")];
  mocks.studio.currentHandle = "alpha";
  mocks.studio.currentChannel = channel("alpha", "Alpha");
  // The per-video panel below the scope totals fetches independently; it is not
  // what this test is about, so keep it quiet and empty.
  mocks.listChannelVideos.mockResolvedValue({ videos: [] });
  mocks.getMyStats.mockResolvedValue(statsFor(0));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnalyticsView channel scope", () => {
  it("never shows the previous channel's totals under the new channel's name", async () => {
    // Regression: ChannelScope STORED its status in useState and the render site
    // passes no `key` (unlike VideoStatsSection, which keys on the handle). So a
    // studio channel switch (StudioNav) restarted the fetch while status stayed
    // "ready" — the section relabelled to the new handle immediately and kept
    // rendering the OLD channel's views/likes/followers until the new fetch landed.
    let releaseBeta!: (value: unknown) => void;
    mocks.getChannelStats.mockImplementation((handle: string) => {
      if (handle === "alpha") return Promise.resolve(statsFor(111));
      return new Promise((resolve) => {
        releaseBeta = resolve;
      });
    });

    const { rerender } = render(<AnalyticsView />);
    // Alpha's totals land.
    await waitFor(() => expect(screen.getByLabelText("Stats for @alpha")).toBeTruthy());
    expect(screen.getAllByTitle("111").length).toBeGreaterThan(0);

    // The studio switches channel; beta's request is still in flight.
    mocks.studio.currentHandle = "beta";
    mocks.studio.currentChannel = channel("beta", "Beta");
    rerender(<AnalyticsView />);

    // Alpha's numbers must NOT be on screen under beta's label.
    expect(screen.queryAllByTitle("111")).toHaveLength(0);
    expect(screen.queryByLabelText("Stats for @beta")).toBeNull();
    expect(screen.getByLabelText("Loading channel stats")).toBeTruthy();

    // Once beta resolves, its own totals appear.
    await waitFor(() => expect(releaseBeta).toBeTypeOf("function"));
    releaseBeta(statsFor(222));
    await waitFor(() => expect(screen.getByLabelText("Stats for @beta")).toBeTruthy());
    expect(screen.getAllByTitle("222").length).toBeGreaterThan(0);
  });
});
