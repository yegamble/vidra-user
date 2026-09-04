import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";
import { uuidToShortId } from "@/lib/short-id";

const mocks = vi.hoisted(() => ({
  getPublicVideoByCode: vi.fn(),
  watchView: vi.fn(() => null),
  permanentRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/components/WatchView", () => ({ WatchView: mocks.watchView }));
vi.mock("@/lib/video.server", () => ({ getPublicVideoByCode: mocks.getPublicVideoByCode }));
vi.mock("@/lib/instance-config.server", () => ({
  getInstanceConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock("next/navigation", () => ({
  permanentRedirect: mocks.permanentRedirect,
  notFound: mocks.notFound,
}));

import ShortCodeWatchPage from "./page";

const CODE = "abcdefghijk";
const UUID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";

describe("ShortCodeWatchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the watch view for a stored short code", async () => {
    const video = { id: UUID, short_code: CODE, title: "Seeded" } as Video;
    mocks.getPublicVideoByCode.mockResolvedValue(video);

    const page = await ShortCodeWatchPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) });
    const watchView = page.props.children;

    expect(mocks.getPublicVideoByCode).toHaveBeenCalledWith(CODE);
    expect(watchView.props).toMatchObject({ code: CODE, initialVideo: video });
    expect(mocks.permanentRedirect).not.toHaveBeenCalled();
  });

  // A private/locked/backend-down video seeds null and WatchView refetches with
  // the viewer's session. It must still RENDER, not 404 — otherwise an owner
  // could not reach their own unlisted video by its short link.
  it("still renders when the anonymous seed is null", async () => {
    mocks.getPublicVideoByCode.mockResolvedValue(null);
    const page = await ShortCodeWatchPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) });
    expect(page.props.children.props).toMatchObject({ code: CODE, initialVideo: null });
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  // The legacy band keeps its permanent redirect to the canonical watch URL.
  // Those links are published and their 301s are cached in viewers' browsers.
  it("redirects a legacy derived sid to the canonical watch URL", async () => {
    const sid = uuidToShortId(UUID)!;
    await expect(
      ShortCodeWatchPage({ params: Promise.resolve({ code: sid }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(`/videos/${UUID}`);
    expect(mocks.getPublicVideoByCode).not.toHaveBeenCalled();
  });

  it("404s anything that is neither encoding, without a backend round trip", async () => {
    for (const bad of ["nope", "abcdefghij0", UUID, ""]) {
      await expect(
        ShortCodeWatchPage({ params: Promise.resolve({ code: bad }), searchParams: Promise.resolve({}) }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mocks.getPublicVideoByCode).not.toHaveBeenCalled();
    }
  });

  // ?t= start times ride on these links. The route handler this page replaced
  // forwarded req.nextUrl.search verbatim; a page never sees the raw string, so
  // dropping it here would silently start every shared timestamp link at zero.
  it("carries the query string through the legacy redirect", async () => {
    const sid = uuidToShortId(UUID)!;
    await expect(
      ShortCodeWatchPage({
        params: Promise.resolve({ code: sid }),
        searchParams: Promise.resolve({ t: "90" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(`/videos/${UUID}?t=90`);
  });

  it("keeps repeated query values on the legacy redirect", async () => {
    const sid = uuidToShortId(UUID)!;
    await expect(
      ShortCodeWatchPage({
        params: Promise.resolve({ code: sid }),
        searchParams: Promise.resolve({ tag: ["a", "b"], t: "5" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(`/videos/${UUID}?tag=a&tag=b&t=5`);
  });
});
