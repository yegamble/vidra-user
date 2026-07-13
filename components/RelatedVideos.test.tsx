// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const previewMocks = vi.hoisted(() => ({
  featureEnabled: false,
  preferenceEnabled: false,
  sensitivePolicy: "display" as "display" | "warn" | "blur",
  restrictedMode: false,
  props: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/VideoActionsMenu", () => ({
  VideoActionsMenu: ({
    video,
    onDeleted,
  }: {
    video: { title: string };
    onDeleted?: () => void;
  }) => (
    <button type="button" aria-label={`Actions for ${video.title}`} onClick={onDeleted}>
      Actions
    </button>
  ),
}));

vi.mock("@/components/VideoCardPreview", () => ({
  VideoCardPreview: (props: Record<string, unknown>) => {
    previewMocks.props.set(String(props.videoId), props);
    return (
      <a href={String(props.href)} aria-label={String(props.title)} data-testid={`preview-${props.videoId}`}>
        {props.fallback as React.ReactNode}
        {props.overlay as React.ReactNode}
      </a>
    );
  },
}));

vi.mock("@/lib/instance-features", () => ({
  useInstanceFeatures: () => ({ video_card_previews: previewMocks.featureEnabled }),
}));

vi.mock("@/lib/player-settings", () => ({
  usePlayerSettings: () => ({
    video_card_previews_enabled: previewMocks.preferenceEnabled,
  }),
}));

vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => previewMocks.sensitivePolicy,
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => previewMocks.restrictedMode,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getVideoRecommendations: vi.fn(),
    listChannelVideos: vi.fn(),
    getFeed: vi.fn(),
  },
  remoteVideoThumbnailUrl: (id: string) => `/remote/${id}/thumbnail`,
  videoOriginalUrl: (id: string) => `/videos/${id}/original`,
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  isSensitiveVideo: (candidate: { is_sensitive?: boolean }) => candidate.is_sensitive === true,
}));

import { api, type Video } from "@/lib/api";
import { RelatedVideos } from "@/components/RelatedVideos";

const getVideoRecommendations = vi.mocked(api.getVideoRecommendations);
const listChannelVideos = vi.mocked(api.listChannelVideos);
const getFeed = vi.mocked(api.getFeed);

function video(id: string, title: string): Video {
  return {
    id,
    channel_id: "channel-1",
    channel_handle: "film-house",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: false,
  } as Video;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  previewMocks.featureEnabled = false;
  previewMocks.preferenceEnabled = false;
  previewMocks.sensitivePolicy = "display";
  previewMocks.restrictedMode = false;
  previewMocks.props.clear();
});

describe("RelatedVideos recommendations endpoint", () => {
  it("renders the recommendations endpoint's items and does not consult the fallback", async () => {
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [video("rec-1", "Recommended one"), video("rec-2", "Recommended two")],
      personalized: false,
      source: "search",
    } as never);

    render(<RelatedVideos video={current} />);

    expect(await screen.findByRole("heading", { name: "Recommended one" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recommended two" })).toBeTruthy();
    // The heuristic fallback endpoints are not called when the endpoint answers.
    expect(listChannelVideos).not.toHaveBeenCalled();
    expect(getFeed).not.toHaveBeenCalled();
    // Rows carry the ?src=related discovery marker.
    const link = screen.getByRole("heading", { name: "Recommended one" }).closest("a");
    expect(link?.getAttribute("href")).toBe("/videos/rec-1?src=related");
  });

  it("falls back to the channel+category composition when the endpoint is empty", async () => {
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [],
      personalized: false,
      source: "fallback",
    } as never);
    listChannelVideos.mockResolvedValue({ videos: [current, video("chan-1", "Channel next")] } as never);
    getFeed.mockResolvedValue({ videos: [] } as never);

    render(<RelatedVideos video={current} />);
    expect(await screen.findByRole("heading", { name: "Channel next" })).toBeTruthy();
  });

  it("falls back to the composition when the endpoint errors", async () => {
    const current = video("current", "Current video");
    getVideoRecommendations.mockRejectedValue(new Error("boom"));
    listChannelVideos.mockResolvedValue({ videos: [current, video("chan-2", "Errored fallback")] } as never);
    getFeed.mockResolvedValue({ videos: [] } as never);

    render(<RelatedVideos video={current} />);
    expect(await screen.findByRole("heading", { name: "Errored fallback" })).toBeTruthy();
  });
});

describe("RelatedVideos video actions", () => {
  it("removes a deleted related row and clears the reported next video", async () => {
    const current = video("current", "Current video");
    const next = video("next", "Related video");
    const onFirstRelated = vi.fn();
    // Endpoint empty → the fallback composition supplies the rows this test drives.
    getVideoRecommendations.mockResolvedValue({ items: [], personalized: false, source: "fallback" } as never);
    listChannelVideos.mockResolvedValue({ videos: [current, next] } as never);
    getFeed.mockResolvedValue({ videos: [] } as never);

    render(<RelatedVideos video={current} onFirstRelated={onFirstRelated} />);

    const actions = await screen.findByRole("button", { name: "Actions for Related video" });
    expect(actions.parentElement?.className).toContain("opacity-0");
    expect(actions.parentElement?.className).toContain("group-hover/card:opacity-100");
    expect(actions.parentElement?.className).toContain("group-focus-within/card:opacity-100");
    expect(actions.parentElement?.className).toContain("[@media(hover:none)]:opacity-100");
    fireEvent.click(actions);
    expect(screen.queryByRole("heading", { name: "Related video" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Related videos" })).toBeNull();
    await waitFor(() => expect(onFirstRelated).toHaveBeenLastCalledWith(null));
  });
});

describe("RelatedVideos inline preview integration", () => {
  it("uses a local original only after both the admin and viewer gates allow previews", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [video("next", "Related video")],
      personalized: false,
      source: "search",
    } as never);

    render(<RelatedVideos video={current} />);
    await screen.findByRole("heading", { name: "Related video" });

    expect(previewMocks.props.get("next")?.previewEnabled).toBe(true);
    expect(previewMocks.props.get("next")?.src).toBe("/videos/next/original");
    expect(previewMocks.props.get("next")?.href).toBe("/videos/next?src=related");
  });

  it.each([
    [false, true],
    [true, false],
  ])("stays poster-only when admin=%s and viewer=%s", async (admin, viewer) => {
    previewMocks.featureEnabled = admin;
    previewMocks.preferenceEnabled = viewer;
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [video("next", "Related video")],
      personalized: false,
      source: "search",
    } as never);

    render(<RelatedVideos video={current} />);
    await screen.findByRole("heading", { name: "Related video" });

    expect(previewMocks.props.get("next")?.previewEnabled).toBe(false);
    expect(previewMocks.props.get("next")?.src).toBeNull();
  });

  it.each([
    { remote: true },
    { privacy: "private" },
    { state: "processing" },
  ])("does not preview an ineligible related payload %#", async (overrides) => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [{ ...video("next", "Related video"), ...overrides }],
      personalized: false,
      source: "search",
    } as never);

    render(<RelatedVideos video={current} />);
    await screen.findByRole("heading", { name: "Related video" });

    expect(previewMocks.props.get("next")?.previewEnabled).toBe(false);
    expect(previewMocks.props.get("next")?.src).toBeNull();
  });

  it("keeps a blurred sensitive recommendation poster-only", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    previewMocks.sensitivePolicy = "blur";
    const current = video("current", "Current video");
    getVideoRecommendations.mockResolvedValue({
      items: [{ ...video("next", "Related video"), is_sensitive: true }],
      personalized: false,
      source: "search",
    } as never);

    render(<RelatedVideos video={current} />);
    await screen.findByRole("heading", { name: "Related video" });

    expect(previewMocks.props.get("next")?.previewEnabled).toBe(false);
    expect(String(previewMocks.props.get("next")?.posterClassName)).toContain("blur-2xl");
  });
});
