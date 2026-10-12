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
  VideoRow: ({ video, leading }: { video: { title: string }; leading?: React.ReactNode }) => (
    <li>
      {leading}
      {video.title}
    </li>
  ),
}));

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
  mocks.getInstance.mockResolvedValue({ features: {} });
  mocks.listMyVideos.mockResolvedValue({ videos: rows(3), total: 3, limit: 20, offset: 0 });
  mocks.getMyPlaylists.mockResolvedValue({ playlists: [{ id: "p1", title: "Faves" }], total: 1 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
    expect((screen.getByLabelText("Search") as HTMLInputElement).value).toBe("holiday");
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
    const box = screen.getByLabelText("Search");
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
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "failed" } });
    expect(nav.replace.mock.calls.at(-1)?.[0]).toContain("mv_state=failed");
  });
});

describe("MyVideosManager bulk actions", () => {
  async function pick(...titles: string[]) {
    await screen.findByText("Clip 0");
    for (const t of titles) fireEvent.click(screen.getByLabelText(`Select ${t}`));
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
    await screen.findByText(/Updated 1 of 2\. 1 failed/);
    expect(mocks.bulkMyVideos).toHaveBeenCalledWith({ video_ids: ["v0", "v1"], action: "set_privacy", privacy: "private" });
    const failures = screen.getByRole("list", { name: "Videos that failed" });
    expect(within(failures).getByText(/needs at least one password/)).toBeTruthy();
    // The list refreshes after the action; the failed row comes back still selected.
    expect(((await screen.findByLabelText("Select Clip 1")) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Select Clip 0") as HTMLInputElement).checked).toBe(false);
  });

  it("reports a refused request (404) as nothing changed", async () => {
    mocks.bulkMyVideos.mockRejectedValue(new Error("video not found"));
    render(<MyVideosManager config={null} channels={channels} />);
    await pick("Clip 0");
    fireEvent.click(screen.getByRole("button", { name: /Change privacy/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Internal" }));
    await screen.findByText(/Nothing was changed/);
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
