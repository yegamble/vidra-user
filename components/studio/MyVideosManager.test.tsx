// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/studio/content",
  useSearchParams: () => nav.params,
}));

const mocks = vi.hoisted(() => ({
  listMyVideos: vi.fn(),
  listChannelVideos: vi.fn(),
  bulkMyVideos: vi.fn(),
  getInstance: vi.fn(),
  getMyPlaylists: vi.fn(),
  addToPlaylist: vi.fn(),
}));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: mocks,
}));
vi.mock("./VideoRow", () => ({
  VideoRow: ({
    video,
    leading,
    canTransfer,
  }: {
    video: { title: string };
    leading?: React.ReactNode;
    canTransfer?: boolean;
  }) => (
    <li data-transfer={canTransfer ? "yes" : "no"}>
      {leading}
      {video.title}
    </li>
  ),
}));

import { ApiError } from "@/lib/api";

import { I18nProvider } from "@/components/I18nProvider";

import { MyVideosManager } from "./MyVideosManager";

const channels = [
  { id: "c1", handle: "ada", display_name: "Ada", owner_id: "u1" },
  { id: "c2", handle: "ada2", display_name: "Ada Two", owner_id: "u1" },
] as never;
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `v${i}`, title: `Clip ${i}`, privacy: "public", state: "published" }));
const ok = (ids: string[]) => ({
  results: ids.map((id) => ({ video_id: id, ok: true, status: 200 })),
  succeeded: ids.length,
  failed: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  mocks.listChannelVideos.mockResolvedValue({ videos: rows(3), total: 3, limit: 20, offset: 0 });
  mocks.getInstance.mockResolvedValue({ features: {} });
  mocks.listMyVideos.mockResolvedValue({ videos: rows(3), total: 3, limit: 20, offset: 0 });
  mocks.getMyPlaylists.mockResolvedValue({ playlists: [{ id: "p1", title: "Faves" }], total: 1 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MyVideosManager catalog", () => {
  it("renders the provided catalog, en for a missing key, with the video-count plural", async () => {
    mocks.listMyVideos.mockResolvedValue({ videos: rows(1), total: 1, limit: 20, offset: 0 });
    render(
      <I18nProvider locale="fr" messages={{ "studio.list.title": "Vos vidéos" }}>
        <MyVideosManager config={null} channels={channels} />
      </I18nProvider>,
    );
    await screen.findByText("Clip 0");
    expect(screen.getByText("Vos vidéos")).toBeTruthy();
    expect(screen.getByText("1 video")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});

describe("MyVideosManager filters", () => {
  it("restores filters from the URL into the request", async () => {
    nav.params = new URLSearchParams("mv_q=holiday&mv_privacy=internal&mv_state=draft&mv_channel=c2");
    render(<MyVideosManager config={null} channels={channels} />);
    await screen.findByText("Clip 0");
    expect(mocks.listMyVideos).toHaveBeenCalledWith(
      expect.objectContaining({ q: "holiday", privacy: "internal", state: "draft", channel_id: "c2" }),
      expect.anything(),
    );
    expect((screen.getByLabelText("Filter by title") as HTMLInputElement).value).toBe("holiday");
  });

  it("ignores URL values the contract does not know instead of sending a 422", async () => {
    nav.params = new URLSearchParams("mv_privacy=bogus&mv_state=nope&mv_channel=someone-elses");
    render(<MyVideosManager config={null} channels={channels} />);
    await screen.findByText("Clip 0");
    const call = mocks.listMyVideos.mock.calls[0][0];
    expect(call.privacy).toBeUndefined();
    expect(call.state).toBeUndefined();
    expect(call.channel_id).toBeUndefined();
  });

  it("writes a debounced search to the URL, not one update per keystroke", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<MyVideosManager config={null} channels={channels} />);
    await screen.findByText("Clip 0");
    const box = screen.getByLabelText("Filter by title");
    fireEvent.change(box, { target: { value: "h" } });
    fireEvent.change(box, { target: { value: "ho" } });
    fireEvent.change(box, { target: { value: "hol" } });
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0][0]).toBe("/studio/content?mv_q=hol");
  });

  it("writes a select filter to the URL and shows a filtered empty state", async () => {
    nav.params = new URLSearchParams("mv_privacy=private");
    mocks.listMyVideos.mockResolvedValue({ videos: [], total: 0, limit: 20, offset: 0 });
    render(<MyVideosManager config={null} channels={channels} />);
    await screen.findByText("No videos match these filters");
    fireEvent.change(screen.getByLabelText("Filter by state"), { target: { value: "failed" } });
    expect(nav.replace.mock.calls.at(-1)?.[0]).toContain("mv_state=failed");
  });
});

describe("MyVideosManager channel scope", () => {
  const [c1] = channels as unknown as { id: string; handle: string }[];

  it("lists the studio's current channel through the per-channel endpoint until a filter is set", async () => {
    render(<MyVideosManager config={null} channels={channels} defaultChannel={c1 as never} />);
    await screen.findByText("Clip 0");
    expect(mocks.listChannelVideos).toHaveBeenCalledWith("ada", undefined, expect.anything(), expect.anything());
    expect(mocks.listMyVideos).not.toHaveBeenCalled();
  });

  it("switches to the account-wide endpoint, scoped to that channel, once a filter is set", async () => {
    nav.params = new URLSearchParams("mv_privacy=private");
    render(<MyVideosManager config={null} channels={channels} defaultChannel={c1 as never} />);
    await screen.findByText("Clip 0");
    expect(mocks.listMyVideos).toHaveBeenCalledWith(
      expect.objectContaining({ privacy: "private", channel_id: "c1" }),
      expect.anything(),
    );
  });

  it("'All channels' drops the channel scope", async () => {
    nav.params = new URLSearchParams("mv_channel=all");
    render(<MyVideosManager config={null} channels={channels} defaultChannel={c1 as never} />);
    await screen.findByText("Clip 0");
    expect(mocks.listMyVideos.mock.calls[0][0].channel_id).toBeUndefined();
  });
});

describe("MyVideosManager bulk actions", () => {
  async function pick(...titles: string[]) {
    await screen.findByText("Clip 0");
    for (const t of titles) fireEvent.click(screen.getByLabelText(`Include ${t} in bulk actions`));
  }

  it("confirms a bulk delete naming the count, then refreshes the list", async () => {
    mocks.bulkMyVideos.mockResolvedValue(ok(["v0", "v1"]));
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0", "Clip 1");
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete 2 videos?" });
    expect(mocks.bulkMyVideos).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2" }));
    await waitFor(() =>
      expect(mocks.bulkMyVideos).toHaveBeenCalledWith({ video_ids: ["v0", "v1"], action: "delete" }),
    );
    await screen.findByText("Deleted 2 videos.");
    await waitFor(() => expect(mocks.listMyVideos).toHaveBeenCalledTimes(2));
  });

  it("lists per-item failures and keeps those videos selected", async () => {
    mocks.bulkMyVideos.mockResolvedValue({
      results: [
        { video_id: "v0", ok: true, status: 200 },
        { video_id: "v1", ok: false, status: 400, error: "a password-protected video needs at least one password" },
      ],
      succeeded: 1,
      failed: 1,
    });
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0", "Clip 1");
    fireEvent.click(screen.getByRole("button", { name: /Change privacy/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Private" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make private" }));
    await screen.findByText(/Updated 1 of 2\. 1 failed/);
    expect(mocks.bulkMyVideos).toHaveBeenCalledWith({ video_ids: ["v0", "v1"], action: "set_privacy", privacy: "private" });
    const failures = screen.getByRole("list", { name: "Videos that failed" });
    expect(within(failures).getByText(/needs at least one password/)).toBeTruthy();
    // The list refreshes after the action; the failed row comes back still selected.
    expect(((await screen.findByLabelText("Include Clip 1 in bulk actions")) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Include Clip 0 in bulk actions") as HTMLInputElement).checked).toBe(false);
  });

  it("confirms a privacy change naming the count and target, and warns that public federates", async () => {
    mocks.bulkMyVideos.mockResolvedValue(ok(["v0", "v1"]));
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0", "Clip 1");
    fireEvent.click(screen.getByRole("button", { name: /Change privacy/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Public" }));
    const dialog = screen.getByRole("dialog", { name: "Make 2 videos public?" });
    expect(within(dialog).getByText(/federated/)).toBeTruthy();
    expect(mocks.bulkMyVideos).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make public" }));
    await waitFor(() =>
      expect(mocks.bulkMyVideos).toHaveBeenCalledWith({ video_ids: ["v0", "v1"], action: "set_privacy", privacy: "public" }),
    );
  });

  async function failBulk(err: unknown) {
    mocks.bulkMyVideos.mockRejectedValue(err);
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0");
    fireEvent.click(screen.getByRole("button", { name: /Change privacy/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Internal" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make internal" }));
  }

  it("says nothing changed only when the server refused the request (4xx)", async () => {
    await failBulk(new ApiError({ status: 404, code: "not_found", message: "video not found" }));
    await screen.findByText(/Nothing was changed/);
    expect(mocks.listMyVideos).toHaveBeenCalledTimes(1);
  });

  it("does not claim nothing changed after a network failure, and refreshes the list", async () => {
    await failBulk(new TypeError("fetch failed"));
    await screen.findByText(/Couldn't confirm the result/);
    expect(screen.queryByText(/Nothing was changed/)).toBeNull();
    await waitFor(() => expect(mocks.listMyVideos).toHaveBeenCalledTimes(2));
  });

  it("caps selection at 100 with a visible note", async () => {
    mocks.listMyVideos.mockResolvedValue({ videos: rows(120), total: 120, limit: 120, offset: 0 });
    render(<MyVideosManager config={null} channels={channels} />);
    await screen.findByText("Clip 0");
    fireEvent.click(screen.getByLabelText("Select first 100"));
    expect(screen.getByText("100 selected")).toBeTruthy();
    expect(screen.getByText("Selection is limited to 100 videos per action.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Include Clip 110 in bulk actions"));
    expect(screen.getByText("100 selected")).toBeTruthy();
  });

  it("adds each selected video to a playlist with progress and a failure summary", async () => {
    mocks.addToPlaylist.mockImplementation((_p: string, v: string) =>
      v === "v1" ? Promise.reject(new Error("boom")) : Promise.resolve(),
    );
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0", "Clip 1", "Clip 2");
    fireEvent.click(screen.getByRole("button", { name: /Add to playlist/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Faves" }));
    await screen.findByText("Added 2 of 3 to Faves.");
    expect(mocks.addToPlaylist).toHaveBeenCalledTimes(3);
    expect(within(screen.getByRole("list", { name: "Videos that could not be added" })).getByText(/Clip 1/)).toBeTruthy();
  });
});

// The manager lists only the caller's OWN channels, so every row may offer the
// owner-only ownership transfer (core 0165); the per-channel section used for a
// channel the caller merely edits never does.
describe("MyVideosManager transfer", () => {
  it("offers the transfer on every row", async () => {
    render(<MyVideosManager config={null} channels={channels} defaultChannel={null} />);
    const row = (await screen.findByText("Clip 0")).closest("li");
    expect(row?.getAttribute("data-transfer")).toBe("yes");
  });
});
