// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);

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

// The filter panel's taxonomy: its own module, so the `@/lib/api` mock below
// does not cover it. Resolving keeps the category/language selects enabled.
// The behavioural event the results page emits for a submitted search. It is
// now the ONLY record of a browser search: core skips its routed emit when the
// request declares the client sends this (see lib/search-session.ts), so a lost
// one is a search that vanishes from the instance's own analytics AND from the
// user's search-history page.
const trackSearchEvent = vi.fn();
vi.mock("@/lib/search-events", () => ({
  trackSearchEvent: (...args: unknown[]) => trackSearchEvent(...args),
}));

vi.mock("@/lib/api/video-config", () => ({
  getVideoConfigCached: vi.fn(() =>
    Promise.resolve({
      categories: [{ id: "7", label: "Gaming" }],
      languages: [{ id: "en", label: "English" }],
      licenses: [],
      privacies: [],
    }),
  ),
}));

// The current access token the mocked auth store reports; tests flip it to
// exercise the authed/anonymous help-text and follow affordances (W13).
let mockedToken: string | null = null;

// The session in context. null is the shipped default for this file: these
// tests render SearchResults bare, with no AuthProvider above it, which is
// exactly what useOptionalSession answers null for — and a read with no
// provider can never be waiting for one.
let optionalSession: { status: string; user: { id: string } | null } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => optionalSession,
}));

vi.mock("@/lib/api", () => ({
  api: {
    searchVideos: vi.fn(),
    searchChannels: vi.fn(),
    searchAccounts: vi.fn(),
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
  channelAvatarUrl: (handle: string) => `/channels/${handle}/avatar`,
  userAvatarUrl: (id: string) => `/users/${id}/avatar`,
  isSensitiveVideo: (candidate: { is_sensitive?: boolean }) => candidate.is_sensitive === true,
  // The W5 miniature-name hook primes this shared fetch; rejecting keeps the
  // instance defaults null (today's channel attribution, and the Load more
  // button rather than auto-load).
  getInstanceCached: vi.fn(() => Promise.reject(new Error("no backend in unit tests"))),
}));

import { api, type AccountSearchResult, type Channel, type Video } from "@/lib/api";
import { setInstanceDefaultsForTests } from "@/lib/instance-defaults";
import { navigation } from "@/lib/test-navigation";
import { SearchResults } from "@/components/SearchResults";

const searchVideos = vi.mocked(api.searchVideos);
const searchChannels = vi.mocked(api.searchChannels);
const searchAccounts = vi.mocked(api.searchAccounts);
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

function channel(id: string, handle: string): Channel {
  return {
    id,
    handle,
    display_name: handle.toUpperCase(),
    description: "",
    owner_id: "owner-1",
    follower_count: 12,
    has_avatar: false,
    has_banner: false,
    created_at: "2026-01-01T00:00:00Z",
  } as Channel;
}

function account(id: string, username: string): AccountSearchResult {
  return { id, username, display_name: username.toUpperCase(), bio: "a bio" };
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

beforeEach(() => {
  navigation.reset("/search", "q=grading");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockedToken = null;
  setInstanceDefaultsForTests(null);
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
    // Eligibility is a policy answer, not evidence a storyboard was generated;
    // a search hit carries no has_storyboard flag, so the row claims nothing.
    expect(previewMocks.props.get("v1")?.hasStoryboard).toBe(false);
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

describe("SearchResults counts", () => {
  it("shows the server's per-viewer total, not the page length", async () => {
    searchVideos.mockResolvedValue({
      videos: [video("v1", "Search match")],
      total: 42,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByText(/42 results/)).toBeTruthy();
  });

  it("marks a recall-capped count as a lower bound rather than an exact figure", async () => {
    searchVideos.mockResolvedValue({
      videos: [video("v1", "Search match")],
      total: 1000,
      total_is_lower_bound: true,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" />);

    expect(await screen.findByText(/1000\+ results/)).toBeTruthy();
    expect(screen.getByText(/stopped counting here/)).toBeTruthy();
  });

  it("shows no count at all when the backend reports none", async () => {
    searchVideos.mockResolvedValue({ videos: [video("v1", "Search match")] } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Search match" });

    expect(screen.queryByText(/results$/)).toBeNull();
  });
});

describe("SearchResults pagination", () => {
  it("believes the server's has_more over the page's length", async () => {
    // One row back, and the server says that is all there is — the short-page
    // guess would have agreed here, so make it disagree: a FULL page with
    // has_more false.
    searchVideos.mockResolvedValue({
      videos: Array.from({ length: 20 }, (_, i) => video(`v${i}`, `Match ${i}`)),
      total: 100,
      has_more: false,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Match 0" });

    // total=100 would say "more"; has_more is exact and wins.
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("appends the next page and asks for it at the right offset", async () => {
    searchVideos.mockImplementation((_q, params) =>
      Promise.resolve({
        videos:
          (params?.offset ?? 0) === 0
            ? [video("v1", "Match one")]
            : [video("v2", "Match two")],
        total: 2,
        has_more: (params?.offset ?? 0) === 0,
        limit: 20,
        offset: params?.offset ?? 0,
      } as never),
    );

    render(<SearchResults query="grading" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("heading", { name: "Match two" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Match one" })).toBeTruthy();
    expect(searchVideos).toHaveBeenLastCalledWith(
      "grading",
      expect.objectContaining({ offset: 1, limit: 20 }),
      expect.anything(),
    );
  });
});

describe("SearchResults filter facets", () => {
  it("expands the URL buckets into the endpoint's parameters", async () => {
    searchVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 } as never);

    render(
      <SearchResults
        query="grading"
        filters={{
          sort: "-views",
          duration: "medium",
          published: "7d",
          tagsAll: ["ocean", "reef"],
          tagsOne: ["1970s"],
          category: "7",
        }}
      />,
    );

    await waitFor(() => expect(searchVideos).toHaveBeenCalled());
    const params = searchVideos.mock.calls[0][1];
    expect(params).toMatchObject({
      sort: "-views",
      durationMin: 240,
      durationMax: 600,
      tagsAllOf: "ocean,reef",
      tagsOneOf: "1970s",
      category: "7",
    });
    expect(typeof params?.publishedAfter).toBe("string");
  });

  it("tells an empty filtered search apart from an empty search", async () => {
    searchVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 } as never);

    render(<SearchResults query="grading" filters={{ duration: "long" }} />);

    expect(await screen.findByText(/Try removing a filter/)).toBeTruthy();
  });
});

describe("SearchResults result types", () => {
  it("puts the chosen tab in the URL without touching the query or the facets", async () => {
    searchVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 } as never);

    render(<SearchResults query="grading" filters={{ category: "7" }} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Channels" }));

    expect(navigation.pushed.at(-1)).toBe("/search?q=grading&type=channels&category=7");
  });

  it("lists channels from the channel endpoint with their own count", async () => {
    searchChannels.mockResolvedValue({
      query: "grading",
      channels: [channel("c1", "film-house")],
      total: 3,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" type="channels" />);

    expect(await screen.findByText("FILM-HOUSE")).toBeTruthy();
    expect(screen.getByText("@film-house")).toBeTruthy();
    expect(screen.getByText(/3 channels/)).toBeTruthy();
    // Each tab is its own endpoint: the video search is never called for it.
    expect(searchVideos).not.toHaveBeenCalled();
    expect(searchChannels).toHaveBeenCalledWith(
      "grading",
      expect.objectContaining({ offset: 0 }),
      expect.anything(),
    );
  });

  it("lists accounts from the account endpoint and links to their profiles", async () => {
    searchAccounts.mockResolvedValue({
      query: "grading",
      accounts: [account("u1", "ada")],
      total: 1,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" type="accounts" />);

    expect(await screen.findByText("ADA")).toBeTruthy();
    expect(screen.getByText(/1 account$/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /ADA/ }).getAttribute("href")).toBe("/users/ada");
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it("says so when an entity search matches nothing", async () => {
    searchChannels.mockResolvedValue({
      query: "grading",
      channels: [],
      total: 0,
      limit: 20,
      offset: 0,
    } as never);

    render(<SearchResults query="grading" type="channels" />);

    expect(await screen.findByText("No channels")).toBeTruthy();
  });

  it("offers no tab strip before a term is entered", () => {
    render(<SearchResults query="" />);

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Search for videos")).toBeTruthy();
  });
});

// GET /videos/search, /search/channels and /search/accounts are all filtered
// PER VIEWER by core: the accounts this caller muted or blocked drop out, and
// the ranking is personalized for a signed-in caller whose instance and
// preference allow it. A request that goes out before the refresh cookie has
// been redeemed carries no Authorization header, so the server answers as an
// anonymous visitor and the muted author's videos come back — and the search
// page never re-asks.
describe("SearchResults session settling", () => {
  beforeEach(() => {
    optionalSession = null;
  });

  afterEach(() => {
    optionalSession = null;
  });

  it("does not search while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    searchVideos.mockResolvedValue({ query: "cats", videos: [video("v1", "Cats")], total: 1 } as never);
    render(<SearchResults query="cats" filters={{}} type="videos" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it("searches exactly once when the session settles", async () => {
    optionalSession = { status: "restoring", user: null };
    searchVideos.mockResolvedValue({ query: "cats", videos: [video("v1", "Cats")], total: 1 } as never);
    const { rerender } = render(<SearchResults query="cats" filters={{}} type="videos" />);
    optionalSession = { status: "authed", user: { id: "u-1" } };
    rerender(<SearchResults query="cats" filters={{}} type="videos" />);
    expect(await screen.findByText("Cats")).toBeTruthy();
    expect(searchVideos).toHaveBeenCalledTimes(1);
  });

  it("does not list channels while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    searchChannels.mockResolvedValue({ channels: [], total: 0 } as never);
    render(<SearchResults query="cats" filters={{}} type="channels" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(searchChannels).not.toHaveBeenCalled();
  });

  it("does not list accounts while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    searchAccounts.mockResolvedValue({ accounts: [], total: 0 } as never);
    render(<SearchResults query="cats" filters={{}} type="accounts" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(searchAccounts).not.toHaveBeenCalled();
  });
});

describe("SearchResults emits exactly one search.submitted per submitted search", () => {
  function submitted() {
    return trackSearchEvent.mock.calls.filter(
      ([e]) => (e as { type: string }).type === "search.submitted",
    );
  }

  it("emits one for a results-page load", async () => {
    searchVideos.mockResolvedValue({
      query: "grading",
      videos: [video("v1", "Match one")],
      total: 1,
    } as never);
    render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Match one" });
    expect(submitted()).toHaveLength(1);
    expect(submitted()[0][0]).toMatchObject({ type: "search.submitted", query: "grading", count: 1 });
  });

  it("emits one more when a facet changes the query, and none for the page that follows", async () => {
    searchVideos.mockImplementation((_q, params) =>
      Promise.resolve({
        videos:
          (params?.offset ?? 0) === 0
            ? [video("v1", "Match one")]
            : [video("v2", "Match two")],
        total: 2,
        has_more: (params?.offset ?? 0) === 0,
        limit: 20,
        offset: params?.offset ?? 0,
      } as never),
    );
    const { rerender } = render(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Match one" });
    expect(submitted()).toHaveLength(1);

    // A facet change is a NEW search: it resets to page one and is recorded.
    rerender(<SearchResults query="grading" filters={{ category: "7" }} />);
    await waitFor(() => expect(submitted()).toHaveLength(2));

    // Paging is NOT: the reader did not issue a second search, and core is no
    // longer writing a row for the request either.
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "Match two" });
    expect(submitted()).toHaveLength(2);
  });

  it("emits one — not two — across the session settling on a hard load", async () => {
    optionalSession = { status: "restoring", user: null };
    searchVideos.mockResolvedValue({
      query: "grading",
      videos: [video("v1", "Match one")],
      total: 1,
    } as never);
    const { rerender } = render(<SearchResults query="grading" />);
    optionalSession = { status: "authed", user: { id: "u-1" } };
    rerender(<SearchResults query="grading" />);
    await screen.findByRole("heading", { name: "Match one" });
    expect(submitted()).toHaveLength(1);
    optionalSession = null;
  });
});
