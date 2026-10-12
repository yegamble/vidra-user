// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/use-settled-session", () => ({ useSettledSession: () => ({ viewerId: "owner" }) }));
vi.mock("@/lib/use-browse-auto-load", () => ({ useBrowseAutoLoad: () => false }));
import type { Video } from "@/lib/api";
import { PlaylistPanel } from "./PlaylistPanel";

afterEach(cleanup);

const items = [{ id: "a", title: "Alpha" }, { id: "b", title: "Beta" }, { id: "c", title: "Gamma" }] as Video[];
function queue(over: Record<string, unknown> = {}) {
  return {
    meta: { title: "Mix", owner_id: "owner", visibility: "private" },
    pos: 1,
    total: 27,
    loop: false,
    shuffle: false,
    setLoop: vi.fn(),
    setShuffle: vi.fn(),
    itemHref: (v: Video, i: number) => `/videos/${v.id}?playlist=p1&index=${i + 1}`,
    list: { items, hasMore: true, moreStatus: "idle", loadMore: vi.fn() },
    ...over,
  } as never;
}

it("shows title, position and highlights only the playing item", () => {
  render(<PlaylistPanel queue={queue()} videoId="b" />);
  expect(screen.getByText("Mix")).toBeTruthy();
  expect(screen.getByText(/2 \/ 27/)).toBeTruthy();
  const current = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "true");
  expect(current.map((l) => l.textContent)).toEqual([expect.stringContaining("Beta")]);
  expect(current[0].getAttribute("href")).toBe("/videos/b?playlist=p1&index=2");
});

it("loop and shuffle are pressed-state toggles", () => {
  const q = queue({ loop: true });
  render(<PlaylistPanel queue={q} videoId="a" />);
  expect(screen.getByRole("button", { name: "Loop playlist" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Shuffle playlist" }));
  expect((q as unknown as { setShuffle: ReturnType<typeof vi.fn> }).setShuffle).toHaveBeenCalledWith(true);
});

it("pages more items on demand", () => {
  const q = queue();
  render(<PlaylistPanel queue={q} videoId="a" />);
  fireEvent.click(screen.getByRole("button", { name: /load more/i }));
  expect((q as unknown as { list: { loadMore: ReturnType<typeof vi.fn> } }).list.loadMore).toHaveBeenCalled();
});
