// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listChannelVideos: vi.fn(), getInstance: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { listChannelVideos: mocks.listChannelVideos, getInstance: mocks.getInstance },
}));
vi.mock("./VideoRow", () => ({
  VideoRow: ({ video }: { video: { title: string } }) => <li>{video.title}</li>,
}));

import { MyVideosSection } from "./MyVideosSection";

const rows = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${from + i}`, title: `Mine ${from + i}` }));

beforeEach(() => {
  vi.clearAllMocks();
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
});
