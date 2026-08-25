// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { Video, VideoFeedResponse } from "@/lib/api";
import { setInstanceDefaultsForTests } from "@/lib/instance-defaults";

const mocks = vi.hoisted(() => ({
  getFeed: vi.fn(),
  priorities: [] as boolean[],
}));

vi.mock("@/lib/api", () => ({
  api: { getFeed: mocks.getFeed },
  // The instance-defaults store primes this shared fetch; rejecting leaves the
  // defaults null, i.e. today's hardcoded behavior. Tests that need a defaults
  // block install it directly with setInstanceDefaultsForTests.
  getInstanceCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
}));
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

// jsdom has no IntersectionObserver; record the instances so a test can fire a
// sentinel intersection by hand (same approach as lib/use-auto-load.test.tsx).
type Instance = { callback: IntersectionObserverCallback; disconnect: Mock<() => void> };
let observers: Instance[] = [];

class MockIO {
  private self: Instance;
  constructor(callback: IntersectionObserverCallback) {
    this.self = { callback, disconnect: vi.fn() };
    observers.push(this.self);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.self.disconnect();
  }
}

function scrollSentinelIntoView() {
  const io = observers.at(-1);
  if (!io) throw new Error("no IntersectionObserver was constructed");
  act(() => {
    io.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function video(index: number): Video {
  return { id: `v${index}`, title: `Video ${index}` } as Video;
}

function page(videos: Video[], total: number): VideoFeedResponse {
  return { total, videos, sort: "recent", scope: "local", limit: 20, offset: 0 };
}

beforeEach(() => {
  mocks.getFeed.mockReset();
  mocks.priorities.length = 0;
  observers = [];
  vi.stubGlobal("IntersectionObserver", MockIO);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setInstanceDefaultsForTests(null);
});

describe("VideoFeed server seed", () => {
  it("hydrates from the first page without a duplicate fetch and prioritizes one desktop row", () => {
    render(
      <VideoFeed
        sort="recent"
        filters={{ scope: "local" }}
        initialPage={page([video(1), video(2), video(3), video(4)], 4)}
        prioritizeFirstRow
      />,
    );

    expect(screen.getByText("Video 1")).toBeTruthy();
    expect(screen.getByText("Video 4")).toBeTruthy();
    expect(mocks.getFeed).not.toHaveBeenCalled();
    expect(mocks.priorities).toEqual([true, true, true, false]);
  });
});

describe("VideoFeed pagination", () => {
  it("believes the server's total instead of guessing from the page length", () => {
    // A full page that is nevertheless the whole feed: the old short-page guess
    // (length === PAGE_SIZE) would have left a Load more that returns nothing.
    const videos = Array.from({ length: 20 }, (_, i) => video(i));
    render(<VideoFeed sort="recent" initialPage={page(videos, 20)} />);

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("keeps the button while the total says more rows exist, and appends them", async () => {
    const videos = Array.from({ length: 20 }, (_, i) => video(i));
    mocks.getFeed.mockResolvedValue({ ...page([video(20)], 21), offset: 20 });
    render(<VideoFeed sort="recent" initialPage={page(videos, 21)} />);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Video 20")).toBeTruthy();
    expect(mocks.getFeed).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20, limit: 20 }),
      expect.anything(),
    );
    // 21 of 21 held: the pager retires.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load more" })).toBeNull(),
    );
  });
});

describe("VideoFeed auto-load (browse_scroll_mode)", () => {
  const videos = Array.from({ length: 20 }, (_, i) => video(i));

  it("does not observe anything with the default button mode", () => {
    render(<VideoFeed sort="recent" initialPage={page(videos, 21)} />);

    expect(observers).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });

  it("fetches the next page from the sentinel when the operator chose auto", async () => {
    setInstanceDefaultsForTests({ browse_scroll_mode: "auto" });
    mocks.getFeed.mockResolvedValue({ ...page([video(20)], 21), offset: 20 });
    render(<VideoFeed sort="recent" initialPage={page(videos, 21)} />);

    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    scrollSentinelIntoView();

    expect(await screen.findByText("Video 20")).toBeTruthy();
  });

  it("keeps no manual button in auto mode until a page fails, then brings it back", async () => {
    setInstanceDefaultsForTests({ browse_scroll_mode: "auto" });
    mocks.getFeed.mockRejectedValue(new Error("network"));
    render(<VideoFeed sort="recent" initialPage={page(videos, 21)} />);

    // Auto-load carries the list, so the button steps aside…
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    scrollSentinelIntoView();

    // …and comes straight back when the sentinel's page fails: it is the retry,
    // and a sentinel that retried itself would loop.
    expect(await screen.findByRole("button", { name: "Load more" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Could not load more videos.");
  });
});
