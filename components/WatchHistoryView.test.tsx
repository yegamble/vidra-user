// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getWatchHistory: vi.fn(), deleteHistoryEntry: vi.fn() }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getWatchHistory: mocks.getWatchHistory, deleteHistoryEntry: mocks.deleteHistoryEntry },
}));
vi.mock("@/components/VideoCard", () => ({
  VideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));

import { WatchHistoryView } from "./WatchHistoryView";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `v${from + i}`,
    title: `Watched ${from + i}`,
    position_seconds: 0,
    duration_seconds: 60,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteHistoryEntry.mockResolvedValue(undefined);
  mocks.getWatchHistory.mockImplementation((p: { offset?: number }) =>
    Promise.resolve(
      p.offset
        ? { videos: rows(20, 2), total: 22, limit: 20, offset: 20 }
        : { videos: rows(0, 20), total: 22, limit: 20, offset: 0 },
    ),
  );
});
afterEach(cleanup);

describe("WatchHistoryView paging", () => {
  it("reaches page 2 at offset 20 and stops at the total", async () => {
    render(<WatchHistoryView />);
    await screen.findByText("Watched 0");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Watched 21")).toBeTruthy();
    expect(mocks.getWatchHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 20, offset: 20 }),
      expect.anything(),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("asks for the next window from the rows still held after a removal", async () => {
    render(<WatchHistoryView />);
    await screen.findByText("Watched 0");
    fireEvent.click(screen.getByRole("button", { name: "Remove Watched 0 from history" }));
    await vi.waitFor(() => expect(screen.queryByText("Watched 0")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Watched 21");
    expect(mocks.getWatchHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 19 }),
      expect.anything(),
    );
  });
});
