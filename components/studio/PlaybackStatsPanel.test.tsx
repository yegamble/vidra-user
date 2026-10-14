// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getVideoPlaybackStats: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { getVideoPlaybackStats: mocks.getVideoPlaybackStats },
}));

import { PlaybackStatsPanel } from "@/components/studio/PlaybackStatsPanel";

const stats = (over: Record<string, unknown> = {}) => ({
  plays: 12,
  watch_seconds: 5400,
  avg_view_duration_seconds: 125,
  duration_seconds: 200,
  retention: Array.from({ length: 20 }, (_, i) => 1 - i / 25),
  devices: [
    { key: "mobile", watch_seconds: 3600, share: 0.667 },
    { key: "desktop", watch_seconds: 1800, share: 0.333 },
  ],
  os: [],
  daily: [],
  ...over,
});

describe("PlaybackStatsPanel", () => {
  beforeEach(() => mocks.getVideoPlaybackStats.mockReset());
  afterEach(cleanup);

  it("shows a spinner while loading", async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.getVideoPlaybackStats.mockReturnValue(
      new Promise((r) => (resolve = r)),
    );
    render(<PlaybackStatsPanel videoId="v1" />);
    expect(screen.getByLabelText("Loading playback stats")).toBeTruthy();
    resolve(stats());
    expect(await screen.findByText("1.5 h")).toBeTruthy();
  });

  it("renders watch time, average duration, retention and device split", async () => {
    mocks.getVideoPlaybackStats.mockResolvedValue(stats());
    render(<PlaybackStatsPanel videoId="v1" />);
    expect(await screen.findByText("1.5 h")).toBeTruthy();
    expect(screen.getByText("2:05")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Audience retention: 100% watching at the start/,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Mobile 67% of watch time" }),
    ).toBeTruthy();
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(mocks.getVideoPlaybackStats).toHaveBeenCalledWith(
      "v1",
      expect.any(AbortSignal),
    );
  });

  it("omits the retention chart when the server sends none", async () => {
    mocks.getVideoPlaybackStats.mockResolvedValue(stats({ retention: null }));
    render(<PlaybackStatsPanel videoId="v1" />);
    await screen.findByText("1.5 h");
    expect(screen.queryByText("Audience retention")).toBeNull();
  });

  it("shows an empty state with no plays", async () => {
    mocks.getVideoPlaybackStats.mockResolvedValue(
      stats({ plays: 0, watch_seconds: 0, retention: null, devices: [] }),
    );
    render(<PlaybackStatsPanel videoId="v1" />);
    expect(await screen.findByText("No playback data yet")).toBeTruthy();
  });

  it("shows an error state with retry", async () => {
    mocks.getVideoPlaybackStats.mockRejectedValueOnce(new Error("boom"));
    render(<PlaybackStatsPanel videoId="v1" />);
    expect(
      await screen.findByText("Could not load this video's playback stats."),
    ).toBeTruthy();
    mocks.getVideoPlaybackStats.mockResolvedValue(stats());
    screen.getByRole("button", { name: /try again/i }).click();
    expect(await screen.findByText("1.5 h")).toBeTruthy();
  });
});
