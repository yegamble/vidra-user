// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { listUpcomingLiveStreams: mocks.list } }));

import { ChannelUpcomingBadge } from "./ChannelUpcomingBadge";

beforeEach(() => {
  mocks.list.mockReset();
});
afterEach(cleanup);

describe("ChannelUpcomingBadge", () => {
  it("asks for this channel's next upcoming live and links to its watch page", async () => {
    mocks.list.mockResolvedValue({
      live_streams: [
        { id: "s 1", title: "Premiere", channel_handle: "ada", channel_display_name: "Ada", scheduled_start_at: "2026-12-01T18:00:00Z" },
      ],
    });
    render(<ChannelUpcomingBadge handle="ada" />);
    const link = await screen.findByRole("link", { name: /Upcoming.*Premiere/ });
    expect(link.getAttribute("href")).toBe("/live/s%201");
    expect(mocks.list).toHaveBeenCalledWith({ channel: "ada", limit: 1 }, expect.any(AbortSignal));
  });

  it("renders nothing when there is none, and nothing on an error", async () => {
    mocks.list.mockResolvedValueOnce({ live_streams: [] });
    const { container, rerender } = render(<ChannelUpcomingBadge handle="ada" />);
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    expect(container.textContent).toBe("");
    mocks.list.mockRejectedValueOnce(new Error("boom"));
    rerender(<ChannelUpcomingBadge handle="bob" />);
    await vi.waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });
});
