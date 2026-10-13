// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listUserVideos: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { listUserVideos: mocks.listUserVideos },
}));
vi.mock("@/components/ChannelVideoCard", () => ({
  ChannelVideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));

import { UserVideosTab } from "./UserVideosTab";

const vids = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, title: `Video ${from + i}` }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("UserVideosTab", () => {
  it("shows the account's videos in the channel grid and appends the next page", async () => {
    mocks.listUserVideos.mockImplementation((_u: string, _s: unknown, p: { offset?: number }) =>
      Promise.resolve(
        p.offset
          ? { videos: vids(20, 3), total: 23, limit: 20, offset: 20 }
          : { videos: vids(0, 20), total: 23, limit: 20, offset: 0 },
      ),
    );
    render(<UserVideosTab username="ada" name="Ada" />);
    expect(await screen.findByText("Video 0")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Videos by Ada" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Video 22")).toBeTruthy();
    expect(screen.getByText("Video 0")).toBeTruthy();
    expect(mocks.listUserVideos).toHaveBeenLastCalledWith(
      "ada",
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 20 }),
    );
  });

  it("shows an empty state", async () => {
    mocks.listUserVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 });
    render(<UserVideosTab username="ada" name="Ada" />);
    expect(await screen.findByText("No videos yet")).toBeTruthy();
  });

  it("shows an error state", async () => {
    mocks.listUserVideos.mockRejectedValue(new Error("boom"));
    render(<UserVideosTab username="ada" name="Ada" />);
    expect(await screen.findByText("Could not load this account's videos.")).toBeTruthy();
  });
});
