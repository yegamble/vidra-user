import { describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  getPublicVideo: vi.fn(),
  watchView: vi.fn(() => null),
}));

vi.mock("@/components/WatchView", () => ({ WatchView: mocks.watchView }));
vi.mock("@/lib/video.server", () => ({ getPublicVideo: mocks.getPublicVideo }));
vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: vi.fn().mockResolvedValue(null),
}));

import WatchPage from "./page";

describe("WatchPage", () => {
  it("passes the public server document into the client view as its initial seed", async () => {
    const video = { id: "video-1", title: "Seeded video" } as Video;
    mocks.getPublicVideo.mockResolvedValue(video);

    const page = await WatchPage({ params: Promise.resolve({ id: "video-1" }) });
    const watchView = page.props.children;

    expect(mocks.getPublicVideo).toHaveBeenCalledWith("video-1");
    expect(watchView.props).toMatchObject({ id: "video-1", initialVideo: video });
    expect(watchView.key).toBe("video-1");
  });
});
