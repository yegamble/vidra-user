// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getMyChannels: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...(await vi.importActual("@/lib/api")),
  api: { getMyChannels: mocks.getMyChannels },
}));

import { PlaylistChannelSelect } from "./PlaylistChannelSelect";

const ch = (id: string, role: string) => ({ id, handle: id, display_name: `Name ${id}`, role });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("PlaylistChannelSelect", () => {
  it("offers only channels the caller owns", async () => {
    mocks.getMyChannels.mockResolvedValue({ channels: [ch("mine", "owner"), ch("shared", "editor")], total: 2 });
    render(<PlaylistChannelSelect value="" onChange={() => {}} />);
    expect(await screen.findByRole("option", { name: "Name mine" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Name shared" })).toBeNull();
    expect(screen.getByRole("option", { name: "None" })).toBeTruthy();
  });

  it("walks every page of /me/channels", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ch(`a${i}`, "editor"));
    mocks.getMyChannels.mockImplementation((_s: unknown, p: { offset?: number }) =>
      Promise.resolve(
        p.offset ? { channels: [ch("late", "owner")], total: 101 } : { channels: page1, total: 101 },
      ),
    );
    render(<PlaylistChannelSelect value="" onChange={() => {}} />);
    expect(await screen.findByRole("option", { name: "Name late" })).toBeTruthy();
    expect(mocks.getMyChannels).toHaveBeenCalledTimes(2);
    expect(mocks.getMyChannels).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ offset: 100 }));
  });
});
