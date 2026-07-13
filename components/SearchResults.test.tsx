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

// The current access token the mocked auth store reports; tests flip it to
// exercise the authed/anonymous help-text and follow affordances (W13).
let mockedToken: string | null = null;

vi.mock("@/lib/api", () => ({
  api: {
    searchVideos: vi.fn(),
    createRemoteFollow: vi.fn(),
    postSearchEvents: vi.fn(() => Promise.resolve()),
  },
  ApiError: class MockApiError extends Error {
    status: number;
    constructor(status = 500) {
      super("mock api error");
      this.status = status;
    }
  },
  errorMessage: (_err: unknown, fallback: string) => fallback,
  getAccessToken: () => mockedToken,
  remoteVideoThumbnailUrl: (id: string) => `/remote/${id}/thumbnail`,
  videoOriginalUrl: (id: string) => `/videos/${id}/original`,
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  isSensitiveVideo: (candidate: { is_sensitive?: boolean }) => candidate.is_sensitive === true,
  // The W5 miniature-name hook primes this shared fetch; rejecting keeps the
  // instance defaults null (today's channel attribution).
  getInstanceCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
}));

import { api, type Video } from "@/lib/api";
import { SearchResults } from "@/components/SearchResults";

const searchVideos = vi.mocked(api.searchVideos);
const createRemoteFollow = vi.mocked(api.createRemoteFollow);

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

// A search response carrying the W13 additive `remote` array.
function remoteVideoHit(id: string, title: string) {
  return {
    type: "video",
    video: {
      id,
      remote: true,
      domain: "tube.remote.example",
      title,
      description: "from afar",
      object_url: `https://tube.remote.example/videos/${id}`,
      watch_url: `https://tube.remote.example/w/${id}`,
      has_thumbnail: false,
    },
  };
}

const channelHit = {
  type: "channel",
  actor: {
    actor_url: "https://tube.remote.example/video-channels/movies",
    handle: "movies@tube.remote.example",
    domain: "tube.remote.example",
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockedToken = null;
  previewMocks.featureEnabled = false;
  previewMocks.preferenceEnabled = false;
  previewMocks.sensitivePolicy = "display";
  previewMocks.restrictedMode = false;
  previewMocks.props.clear();
});

describe("SearchResults video actions", () => {
  it("renders an action menu for each result and removes a locally deleted row", async () => {
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByRole("heading", { name: "Search match" })).toBeTruthy();
    const actions = screen.getByRole("button", { name: "Actions for Search match" });
    expect(actions.parentElement?.className).toContain("opacity-0");
    expect(actions.parentElement?.className).toContain("group-hover/card:opacity-100");
    expect(actions.parentElement?.className).toContain("group-focus-within/card:opacity-100");
    expect(actions.parentElement?.className).toContain("[@media(hover:none)]:opacity-100");
    fireEvent.click(actions);

    expect(screen.queryByRole("heading", { name: "Search match" })).toBeNull();
    expect(screen.getByText("No results")).toBeTruthy();
  });
});

describe("SearchResults inline preview integration", () => {
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])("keeps a local result poster-only unless admin=%s and viewer=%s", async (admin, viewer) => {
    previewMocks.featureEnabled = admin;
    previewMocks.preferenceEnabled = viewer;
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Search match" });

    expect(previewMocks.props.get("v1")?.previewEnabled).toBe(false);
    expect(previewMocks.props.get("v1")?.src).toBeNull();
  });

  it("uses the local original only when both gates allow a published non-private result", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Search match" });

    expect(previewMocks.props.get("v1")?.previewEnabled).toBe(true);
    expect(previewMocks.props.get("v1")?.src).toBe("/videos/v1/original");
    expect(previewMocks.props.get("v1")?.hasStoryboard).toBe(true);
  });

  it.each([
    { remote: true },
    { privacy: "private" },
    { state: "processing" },
  ])("never exposes the original source for an ineligible result %#", async (overrides) => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    searchVideos.mockResolvedValue({
      videos: [{ ...video("v1", "Search match"), ...overrides }],
    } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Search match" });

    expect(previewMocks.props.get("v1")?.previewEnabled).toBe(false);
    expect(previewMocks.props.get("v1")?.src).toBeNull();
  });

  it("blocks playback when a sensitive result must stay blurred", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    previewMocks.sensitivePolicy = "blur";
    searchVideos.mockResolvedValue({
      videos: [{ ...video("v1", "Search match"), is_sensitive: true }],
    } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Search match" });

    expect(previewMocks.props.get("v1")?.previewEnabled).toBe(false);
    expect(String(previewMocks.props.get("v1")?.posterClassName)).toContain("blur-2xl");
  });

  it("replaces a sensitive result when Restricted Mode is active", async () => {
    previewMocks.featureEnabled = true;
    previewMocks.preferenceEnabled = true;
    previewMocks.restrictedMode = true;
    searchVideos.mockResolvedValue({
      videos: [{ ...video("v1", "Search match"), is_sensitive: true }],
    } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByText("Hidden by Restricted Mode")).toBeTruthy();
    expect(previewMocks.props.has("v1")).toBe(false);
  });
});

describe("SearchResults remote-URI hits (config-parity W13)", () => {
  it("renders a resolved remote video in the fediverse group with its origin badge", async () => {
    searchVideos.mockResolvedValue({
      videos: [video("v1", "Local match")],
      remote: [remoteVideoHit("rv1", "Remote premiere")],
    } as never);

    render(<SearchResults query="https://tube.remote.example/videos/rv1" />);

    expect(await screen.findByText("From the fediverse")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Remote premiere" })).toBeTruthy();
    // The remote row links to the remote watch surface and shows the origin.
    const title = screen.getByRole("heading", { name: "Remote premiere" });
    expect(title.closest("a")?.getAttribute("href")).toBe("/remote/rv1");
    expect(screen.getAllByText("tube.remote.example").length).toBeGreaterThan(0);
    // Local results still render alongside.
    expect(screen.getByRole("heading", { name: "Local match" })).toBeTruthy();
  });

  it("renders remote-only hits even when local results are empty", async () => {
    searchVideos.mockResolvedValue({
      videos: [],
      remote: [remoteVideoHit("rv1", "Remote premiere")],
    } as never);

    render(<SearchResults query="https://tube.remote.example/videos/rv1" />);

    expect(await screen.findByText("From the fediverse")).toBeTruthy();
    expect(screen.queryByText("No results")).toBeNull();
  });

  it("renders a resolved remote channel with open-original and a follow affordance when signed in", async () => {
    mockedToken = "token";
    createRemoteFollow.mockResolvedValue({} as never);
    searchVideos.mockResolvedValue({ videos: [], remote: [channelHit] } as never);

    render(<SearchResults query="@movies@tube.remote.example" />);

    expect(await screen.findByText("movies@tube.remote.example")).toBeTruthy();
    expect(screen.getByText("Remote channel")).toBeTruthy();
    const open = screen.getByRole("link", { name: "Open original" });
    expect(open.getAttribute("href")).toBe("https://tube.remote.example/video-channels/movies");
    fireEvent.click(screen.getByRole("button", { name: "Follow" }));
    await waitFor(() =>
      expect(createRemoteFollow).toHaveBeenCalledWith({
        actor_url: "https://tube.remote.example/video-channels/movies",
      }),
    );
    expect(await screen.findByRole("button", { name: "Requested" })).toBeTruthy();
  });

  it("hides the follow affordance for anonymous viewers", async () => {
    searchVideos.mockResolvedValue({ videos: [], remote: [channelHit] } as never);

    render(<SearchResults query="@movies@tube.remote.example" />);

    expect(await screen.findByText("movies@tube.remote.example")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open original" })).toBeTruthy();
  });

  it("mentions URL/handle search in the prompt only when the caller's gate is on", () => {
    render(
      <SearchResults query="" remoteSearch={{ remote_uri_users: true, remote_uri_anonymous: false }} />,
    );
    // Anonymous caller, anonymous gate off → plain prompt.
    expect(screen.getByText("Enter a search term above.")).toBeTruthy();
    cleanup();

    mockedToken = "token";
    render(
      <SearchResults query="" remoteSearch={{ remote_uri_users: true, remote_uri_anonymous: false }} />,
    );
    expect(screen.getByText(/name@domain handle/)).toBeTruthy();
  });

  it("tolerates a response without the remote field (older backend)", async () => {
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByRole("heading", { name: "Search match" })).toBeTruthy();
    expect(screen.queryByText("From the fediverse")).toBeNull();
  });
});
