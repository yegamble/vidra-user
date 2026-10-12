// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listChannelVideos: vi.fn(), getInstance: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { listChannelVideos: mocks.listChannelVideos, getInstance: mocks.getInstance },
}));
vi.mock("./VideoRow", () => ({
  VideoRow: ({ video, canTransfer }: { video: { title: string }; canTransfer?: boolean }) => (
    <li data-transfer={canTransfer ? "yes" : "no"}>{video.title}</li>
  ),
}));
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/components/auth/AuthProvider", () => ({ useOptionalSession: () => session }));

import type { Channel } from "@/lib/api";

import { MyVideosSection } from "./MyVideosSection";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, title: `Mine ${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  session.user = null;
  mocks.getInstance.mockResolvedValue({ features: {} });
  mocks.listChannelVideos.mockImplementation(
    (_h: string, _t: unknown, _s: unknown, p: { offset?: number }) =>
      Promise.resolve(
        p.offset
          ? { videos: rows(20, 5), total: 25, limit: 20, offset: 20 }
          : { videos: rows(0, 20), total: 25, limit: 20, offset: 0 },
      ),
  );
});
afterEach(cleanup);

describe("MyVideosSection paging", () => {
  it("lets a creator reach videos beyond the newest 20", async () => {
    render(<MyVideosSection handle="creator" config={null} />);
    await screen.findByText("Mine 0");
    expect(screen.queryByText("Mine 24")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Mine 24")).toBeTruthy();
    expect(mocks.listChannelVideos).toHaveBeenLastCalledWith(
      "creator",
      undefined,
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 20 }),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("restarts from offset 0 and drops the old channel's rows when the handle changes", async () => {
    const { rerender } = render(<MyVideosSection handle="creator" config={null} />);
    await screen.findByText("Mine 0");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Mine 24");

    mocks.listChannelVideos.mockImplementation(() =>
      Promise.resolve({ videos: [{ id: "o1", title: "Other 1" }], total: 1, limit: 20, offset: 0 }),
    );
    rerender(<MyVideosSection handle="other" config={null} />);
    expect(await screen.findByText("Other 1")).toBeTruthy();
    expect(screen.queryByText("Mine 0")).toBeNull();
    expect(screen.queryByText("Mine 24")).toBeNull();
    expect(mocks.listChannelVideos).toHaveBeenLastCalledWith(
      "other",
      undefined,
      expect.anything(),
      expect.objectContaining({ offset: 0 }),
    );
  });
});

// Giving a video away is the channel OWNER's call (core 0165): an editor of the
// same channel manages its videos but must never be offered the transfer.
describe("MyVideosSection transfer gate", () => {
  const channels = [{ id: "c1", handle: "creator", owner_id: "owner" }] as Channel[];

  it("lets the channel's owner transfer its videos", async () => {
    session.user = { id: "owner" };
    render(<MyVideosSection handle="creator" config={null} channels={channels} />);
    expect((await screen.findByText("Mine 0")).getAttribute("data-transfer")).toBe("yes");
  });

  it("does not offer it to an editor of the channel", async () => {
    session.user = { id: "editor" };
    render(<MyVideosSection handle="creator" config={null} channels={channels} />);
    expect((await screen.findByText("Mine 0")).getAttribute("data-transfer")).toBe("no");
  });
});
