// @vitest-environment jsdom
//
// The A16 ruling, held where it can regress: a muted or blocked account must
// disappear from its OWN channel page and from the autocomplete suggestions
// that link there, and there must be somewhere to mute it from that is not a
// comment. Slice 3 measured all three gaps; these are the tests that keep them
// closed.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { status: "authed", user: { id: "viewer" } as { id: string } | null },
}));
// Both variants off one mutable session: ChannelView reaches it through
// `useSettledSession`, the search box and the profile view through the optional
// one, and a test that had to keep two in step would drift.
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.session,
  useOptionalSession: () => mocks.session,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/search-events", () => ({ trackSearchEvent: vi.fn() }));
vi.mock("@/components/FollowButton", () => ({ FollowButton: () => <button>Follow</button> }));
vi.mock("@/components/ChannelLiveBadge", () => ({ ChannelLiveBadge: () => null }));
vi.mock("@/components/MessageButton", () => ({ MessageButton: () => null }));
vi.mock("@/components/SupportButton", () => ({ SupportButton: () => null }));
// The real card drags in the whole video-actions menu (own-channel permissions,
// toasts, downloads); this slice cares only about which cards are on the page.
vi.mock("@/components/ChannelVideoCard", () => ({
  ChannelVideoCard: ({ video }: { video: { title: string } }) => <span>{video.title}</span>,
}));

vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: {
    getChannel: vi.fn(),
    listChannelVideos: vi.fn(),
    getSearchSuggestions: vi.fn(),
    deleteSearchHistoryEntry: vi.fn(() => Promise.resolve()),
    getMutedAccounts: vi.fn(),
    getBlockedUsers: vi.fn(),
    muteAccount: vi.fn(() => Promise.resolve()),
    unmuteAccount: vi.fn(() => Promise.resolve()),
    blockUser: vi.fn(() => Promise.resolve()),
    unblockUser: vi.fn(() => Promise.resolve()),
  },
}));

import { api } from "@/lib/api";
import type { SearchSuggestion } from "@/lib/api/types";
import { resetViewerModerationCache } from "@/lib/use-viewer-moderation";

import { ToastProvider } from "@/components/ui/Toast";

import { AccountModerationMenu } from "./AccountModerationMenu";
import { ChannelView } from "./ChannelView";
import { SearchAutocomplete } from "./SearchAutocomplete";

const getChannel = vi.mocked(api.getChannel);
const listChannelVideos = vi.mocked(api.listChannelVideos);
const getSearchSuggestions = vi.mocked(api.getSearchSuggestions);
const getMutedAccounts = vi.mocked(api.getMutedAccounts);
const getBlockedUsers = vi.mocked(api.getBlockedUsers);

const CHANNEL = {
  id: "c1",
  owner_id: "creator",
  handle: "creatorchan",
  display_name: "Creator",
  description: "",
  created_at: "2026-09-06T00:00:00Z",
  follower_count: 1,
  activitypub_enabled: false,
  atproto_enabled: false,
};
const VIDEO = {
  id: "v1",
  channel_id: "c1",
  title: "A video",
  description: "",
  privacy: "public",
  state: "published",
  created_at: "2026-09-06T00:00:00Z",
  updated_at: "2026-09-06T00:00:00Z",
  views: 0,
  has_thumbnail: false,
};

/** The muted/blocked lists as core answers them, `channel_handles` included. */
function mutes(...accounts: { id: string; handles: string[] }[]) {
  return {
    accounts: accounts.map((a) => ({
      user_id: a.id,
      username: a.id,
      display_name: a.id,
      muted_at: "2026-09-06T00:00:00Z",
      channel_handles: a.handles,
    })),
    total: accounts.length,
    limit: 100,
    offset: 0,
  };
}
function blocks(...accounts: { id: string; handles: string[] }[]) {
  return {
    users: accounts.map((a) => ({
      user_id: a.id,
      username: a.id,
      display_name: a.id,
      blocked_at: "2026-09-06T00:00:00Z",
      channel_handles: a.handles,
    })),
    total: accounts.length,
    limit: 100,
    offset: 0,
  };
}

/** The channel page's own cards open a menu that needs the toast context. */
function renderChannel() {
  return render(
    <ToastProvider>
      <ChannelView handle="creatorchan" />
    </ToastProvider>,
  );
}

function suggestion(text: string, extra: Partial<SearchSuggestion> = {}): SearchSuggestion {
  return { text, type: "query", is_personal: false, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetViewerModerationCache();
  mocks.session.status = "authed";
  mocks.session.user = { id: "viewer" };
  getChannel.mockResolvedValue(CHANNEL as never);
  listChannelVideos.mockResolvedValue({ videos: [VIDEO], total: 1, limit: 20, offset: 0 } as never);
  getMutedAccounts.mockResolvedValue(mutes() as never);
  getBlockedUsers.mockResolvedValue(blocks() as never);
  getSearchSuggestions.mockResolvedValue({ query: "", suggestions: [] } as never);
});
afterEach(cleanup);

describe("autocomplete drops suggestions naming a muted or blocked account", () => {
  const SUGGESTIONS = [
    suggestion("creator videos"),
    suggestion("Creator", { type: "channel", channel_handle: "CreatorChan" }),
    suggestion("Someone else", { type: "channel", channel_handle: "otherchan" }),
    suggestion("A video", { type: "video", video_id: "v1" }),
    suggestion("creator", { type: "tag" }),
  ];

  async function typeAndSettle() {
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "creator" } });
    await waitFor(() => expect(getSearchSuggestions).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
  }

  /** The rendered option labels. Read off `role="option"` rather than by text,
   *  because the box bolds the typed prefix inside each label — a text query
   *  would silently match nothing and pass an "it is gone" assertion for the
   *  wrong reason. Each label ends with its own type badge ("Video",
   *  "Channel", "Tag"), which is why the expectations below carry it. */
  async function optionLabels(): Promise<string[]> {
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    return screen.getAllByRole("option").map((o) => o.textContent ?? "");
  }

  it("drops the muted account's channel and keeps every other suggestion", async () => {
    getMutedAccounts.mockResolvedValue(mutes({ id: "creator", handles: ["creatorchan"] }) as never);
    getSearchSuggestions.mockResolvedValue({ query: "creator", suggestions: SUGGESTIONS } as never);
    render(<SearchAutocomplete />);
    // The lists are read once, before the first keystroke resolves.
    await waitFor(() => expect(getMutedAccounts).toHaveBeenCalledTimes(1));
    await typeAndSettle();

    const labels = await optionLabels();
    // The handle is matched case-insensitively: the suggestion says
    // "CreatorChan", the mute list says "creatorchan". Everything with no
    // account behind it is untouched — the query and tag suggestions are what
    // the instance's users searched for, not who published it, and a video
    // suggestion carries no handle to match.
    expect(labels).toEqual([
      "creator videos",
      "A videoVideo",
      "Someone elseChannel",
      "creatorTag",
    ]);
  });

  it("drops a blocked account's channel too", async () => {
    getBlockedUsers.mockResolvedValue(blocks({ id: "creator", handles: ["creatorchan"] }) as never);
    getSearchSuggestions.mockResolvedValue({ query: "creator", suggestions: SUGGESTIONS } as never);
    render(<SearchAutocomplete />);
    await waitFor(() => expect(getBlockedUsers).toHaveBeenCalledTimes(1));
    await typeAndSettle();

    const labels = await optionLabels();
    expect(labels).not.toContain("CreatorChannel");
    expect(labels).toContain("Someone elseChannel");
  });

  it("shows everything to an anonymous visitor, and asks for no lists at all", async () => {
    mocks.session.status = "anon";
    mocks.session.user = null;
    getSearchSuggestions.mockResolvedValue({ query: "creator", suggestions: SUGGESTIONS } as never);
    render(<SearchAutocomplete />);
    await typeAndSettle();

    expect(await optionLabels()).toContain("CreatorChannel");
    expect(getMutedAccounts).not.toHaveBeenCalled();
    expect(getBlockedUsers).not.toHaveBeenCalled();
  });

  it("shows everything when the lists cannot be read, and does not retry per keystroke", async () => {
    getMutedAccounts.mockRejectedValue(new Error("offline"));
    getSearchSuggestions.mockResolvedValue({ query: "creator", suggestions: SUGGESTIONS } as never);
    render(<SearchAutocomplete />);
    await waitFor(() => expect(getMutedAccounts).toHaveBeenCalledTimes(1));
    await typeAndSettle();
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "creators" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });

    // Degraded means "hide nothing", never "hide everything".
    expect(await optionLabels()).toContain("CreatorChannel");
    expect(getMutedAccounts).toHaveBeenCalledTimes(1);
  });

  it("reads each list once however many prefixes are typed", async () => {
    getSearchSuggestions.mockResolvedValue({ query: "", suggestions: SUGGESTIONS } as never);
    render(<SearchAutocomplete />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    for (const value of ["c", "cr", "cre", "crea"]) {
      fireEvent.change(input, { target: { value } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 250));
      });
    }
    expect(getMutedAccounts).toHaveBeenCalledTimes(1);
    expect(getBlockedUsers).toHaveBeenCalledTimes(1);
  });
});

describe("the channel page follows the viewer's own mute", () => {
  it("names WHY the grid is empty rather than claiming the channel never published", async () => {
    getMutedAccounts.mockResolvedValue(mutes({ id: "creator", handles: ["creatorchan"] }) as never);
    // What the server answers a muter: the page, with none of the videos.
    listChannelVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 } as never);
    renderChannel();

    expect(await screen.findByText("Videos hidden")).toBeTruthy();
    expect(screen.queryByText("No videos yet")).toBeNull();
    // The header stays: it is the only route to the control that lifts the mute.
    expect(screen.getByRole("heading", { name: "Creator" })).toBeTruthy();
  });

  it("keeps the ordinary empty state for a channel that simply has no videos", async () => {
    listChannelVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 } as never);
    renderChannel();

    expect(await screen.findByText("No videos yet")).toBeTruthy();
    expect(screen.queryByText("Videos hidden")).toBeNull();
  });

  it("hides the grid the moment the viewer mutes, with no refetch", async () => {
    renderChannel();
    expect(await screen.findByText("A video")).toBeTruthy();
    await waitFor(() => expect(getMutedAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mute" }));

    expect(await screen.findByText("Videos hidden")).toBeTruthy();
    expect(screen.queryByText("A video")).toBeNull();
    // The server already answers this viewer with an empty list; the local
    // update only spares them the wait, so nothing is re-read.
    expect(listChannelVideos).toHaveBeenCalledTimes(1);
  });
});

describe("the mute/block control", () => {
  const session = { settled: true, authed: true, viewerId: "viewer", viewerKey: "authed:viewer" };

  it("renders nothing for an anonymous visitor or on your own account", () => {
    const { container: anon } = render(
      <AccountModerationMenu
        accountId="creator"
        accountName="Creator"
        session={{ settled: true, authed: false, viewerId: null, viewerKey: "anon" }}
      />,
    );
    expect(anon.innerHTML).toBe("");
    const { container: self } = render(
      <AccountModerationMenu accountId="viewer" accountName="You" session={session} />,
    );
    expect(self.innerHTML).toBe("");
  });

  it("offers Mute and Block, and reflects an existing mute as Unmute", async () => {
    getMutedAccounts.mockResolvedValue(mutes({ id: "creator", handles: ["creatorchan"] }) as never);
    render(<AccountModerationMenu accountId="creator" accountName="Creator" session={session} />);
    await waitFor(() => expect(getMutedAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    expect(await screen.findByRole("menuitem", { name: "Unmute" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Block" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Mute" })).toBeNull();
  });

  it("blocks, then offers Unblock without a refetch", async () => {
    render(<AccountModerationMenu accountId="creator" accountName="Creator" session={session} />);
    await waitFor(() => expect(getBlockedUsers).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Block" }));
    await waitFor(() => expect(api.blockUser).toHaveBeenCalledWith("creator"));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    expect(await screen.findByRole("menuitem", { name: "Unblock" })).toBeTruthy();
    expect(getBlockedUsers).toHaveBeenCalledTimes(1);
  });

  it("leaves the label alone when the call fails, so the viewer can see it did not take", async () => {
    vi.mocked(api.muteAccount).mockRejectedValue(new Error("offline"));
    render(<AccountModerationMenu accountId="creator" accountName="Creator" session={session} />);
    await waitFor(() => expect(getMutedAccounts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mute" }));
    await waitFor(() => expect(api.muteAccount).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Actions for Creator" }));
    expect(await screen.findByRole("menuitem", { name: "Mute" })).toBeTruthy();
  });
});
