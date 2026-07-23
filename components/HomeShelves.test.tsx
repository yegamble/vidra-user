// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryItem, Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  status: "authed" as "restoring" | "anon" | "authed",
  getWatchHistory: vi.fn(),
  getSubscriptionVideos: vi.fn(),
  progressFractions: [] as (number | undefined)[],
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: mocks.status }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    getWatchHistory: mocks.getWatchHistory,
    getSubscriptionVideos: mocks.getSubscriptionVideos,
  },
}));
vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video, progressFraction }: { video: Video; progressFraction?: number }) => {
    mocks.progressFractions.push(progressFraction);
    return <span data-testid="card">{video.title}</span>;
  },
}));

import { HomeShelves } from "./HomeShelves";

function historyItem(
  id: string,
  title: string,
  positionSeconds: number,
  durationSeconds?: number,
): HistoryItem {
  return {
    id,
    title,
    position_seconds: positionSeconds,
    watched_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
  } as HistoryItem;
}

function video(id: string, title: string): Video {
  return { id, title } as Video;
}

beforeEach(() => {
  mocks.status = "authed";
  mocks.getWatchHistory.mockReset();
  mocks.getSubscriptionVideos.mockReset();
  mocks.getWatchHistory.mockResolvedValue({ videos: [], limit: 20, offset: 0 });
  mocks.getSubscriptionVideos.mockResolvedValue({ videos: [], limit: 20, offset: 0 });
  mocks.progressFractions.length = 0;
  // The pre-paint reservation reads/writes a real localStorage hint; isolate it
  // so no prior test's remembered shelf count leaks into this one.
  localStorage.clear();
});

afterEach(cleanup);

describe("HomeShelves", () => {
  it("renders nothing and never probes auth-only endpoints when signed out", async () => {
    mocks.status = "anon";
    render(<HomeShelves />);

    // Give any (erroneous) effect a chance to fire before asserting absence.
    await Promise.resolve();
    expect(mocks.getWatchHistory).not.toHaveBeenCalled();
    expect(mocks.getSubscriptionVideos).not.toHaveBeenCalled();
    expect(screen.queryByText("Continue watching")).toBeNull();
    expect(screen.queryByText("Following")).toBeNull();
  });

  it("renders nothing when the session is still restoring", async () => {
    mocks.status = "restoring";
    render(<HomeShelves />);

    await Promise.resolve();
    expect(mocks.getWatchHistory).not.toHaveBeenCalled();
    expect(screen.queryByText("Continue watching")).toBeNull();
  });

  it("renders nothing when both shelves come back empty", async () => {
    render(<HomeShelves />);

    await waitFor(() => expect(mocks.getSubscriptionVideos).toHaveBeenCalled());
    expect(screen.queryByText("Continue watching")).toBeNull();
    expect(screen.queryByText("Following")).toBeNull();
  });

  it("shows Continue watching (with resume progress) before Following", async () => {
    mocks.getWatchHistory.mockResolvedValue({
      videos: [historyItem("h1", "Half-watched Doc", 30, 100)],
      limit: 20,
      offset: 0,
    });
    mocks.getSubscriptionVideos.mockResolvedValue({
      videos: [video("f1", "Latest From Ada")],
      limit: 20,
      offset: 0,
    });

    render(<HomeShelves />);

    const continueHeading = await screen.findByText("Continue watching");
    const followingHeading = await screen.findByText("Following");
    expect(screen.getByText("Half-watched Doc")).toBeTruthy();
    expect(screen.getByText("Latest From Ada")).toBeTruthy();
    // "Continue watching" leads the band (Apple-TV "Up Next" ordering).
    expect(
      continueHeading.compareDocumentPosition(followingHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The half-watched tile carries its resume fraction (30 / 100).
    expect(mocks.progressFractions).toContain(0.3);
  });

  it("drops history entries that have no resume position from Continue watching", async () => {
    mocks.getWatchHistory.mockResolvedValue({
      videos: [
        historyItem("h1", "Resume Me", 42, 120),
        historyItem("h2", "Fresh Zero", 0, 120),
        { id: "h3", title: "No Position", watched_at: new Date().toISOString() } as HistoryItem,
      ],
      limit: 20,
      offset: 0,
    });

    render(<HomeShelves />);

    await screen.findByText("Continue watching");
    expect(screen.getByText("Resume Me")).toBeTruthy();
    expect(screen.queryByText("Fresh Zero")).toBeNull();
    expect(screen.queryByText("No Position")).toBeNull();
  });

  it("drops finished (>= 95% watched) videos from Continue watching", async () => {
    mocks.getWatchHistory.mockResolvedValue({
      videos: [
        historyItem("h1", "Still Watching", 40, 100), // 40% → resumable
        historyItem("h2", "Basically Done", 96, 100), // 96% → finished, hidden
        historyItem("h3", "Watched To End", 100, 100), // 100% → finished, hidden
      ],
      limit: 20,
      offset: 0,
    });

    render(<HomeShelves />);

    await screen.findByText("Continue watching");
    expect(screen.getByText("Still Watching")).toBeTruthy();
    expect(screen.queryByText("Basically Done")).toBeNull();
    expect(screen.queryByText("Watched To End")).toBeNull();
    // The one surviving tile carries only its own (non-finished) fraction.
    expect(mocks.progressFractions).toContain(0.4);
  });

  it("reserves skeleton shelves while restoring for a returning signed-in viewer", async () => {
    // Last visit remembered two shelves; the pre-paint hint reserves that space.
    localStorage.setItem("vidra:home-shelves-count", "2");
    mocks.status = "restoring";

    render(<HomeShelves />);

    // Skeleton band is present with the remembered number of shelf skeletons…
    expect(screen.getByTestId("home-shelves-skeleton")).toBeTruthy();
    expect(screen.getAllByTestId("home-shelf-skeleton")).toHaveLength(2);
    // …and the auth-only endpoints are never probed while restoring.
    await Promise.resolve();
    expect(mocks.getWatchHistory).not.toHaveBeenCalled();
    expect(screen.queryByText("Continue watching")).toBeNull();
  });

  it("reserves nothing on a first-ever visit (no remembered shelves)", async () => {
    mocks.status = "restoring";
    render(<HomeShelves />);
    expect(screen.queryByTestId("home-shelves-skeleton")).toBeNull();
  });

  it("remembers the resolved shelf count for next visit", async () => {
    mocks.getWatchHistory.mockResolvedValue({
      videos: [historyItem("h1", "Half-watched Doc", 30, 100)],
      limit: 20,
      offset: 0,
    });
    mocks.getSubscriptionVideos.mockResolvedValue({
      videos: [video("f1", "Latest From Ada")],
      limit: 20,
      offset: 0,
    });

    render(<HomeShelves />);

    await screen.findByText("Continue watching");
    await waitFor(() =>
      expect(localStorage.getItem("vidra:home-shelves-count")).toBe("2"),
    );
  });

  it("remembers zero shelves for a signed-out viewer", async () => {
    mocks.status = "anon";
    render(<HomeShelves />);
    await waitFor(() =>
      expect(localStorage.getItem("vidra:home-shelves-count")).toBe("0"),
    );
  });

  it("omits a shelf whose fetch fails but still renders the other", async () => {
    mocks.getWatchHistory.mockRejectedValue(new Error("boom"));
    mocks.getSubscriptionVideos.mockResolvedValue({
      videos: [video("f1", "Following Survives")],
      limit: 20,
      offset: 0,
    });

    render(<HomeShelves />);

    await screen.findByText("Following");
    expect(screen.getByText("Following Survives")).toBeTruthy();
    expect(screen.queryByText("Continue watching")).toBeNull();
  });
});
