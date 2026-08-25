// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/link needs the App Router context; stub it to a plain <a> so cards are
// real links with assertable hrefs.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The rail is fetch-driven; mock the one endpoint it calls.
vi.mock("@/lib/api", () => ({
  api: { listLivePublicStreams: vi.fn() },
}));

import { api } from "@/lib/api";
import type { LiveStreamCard } from "@/lib/api";

import { LiveNowRail } from "./LiveNowRail";

const mockList = vi.mocked(api.listLivePublicStreams);

function card(id: string, title: string, over: Partial<LiveStreamCard> = {}): LiveStreamCard {
  return {
    id,
    title,
    channel_handle: "auroralab",
    channel_display_name: "Aurora Lab",
    is_live: true,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  mockList.mockReset();
});

describe("LiveNowRail", () => {
  it("renders nothing while there is nothing live", async () => {
    mockList.mockResolvedValue({ total: 0, live_streams: [], limit: 20, offset: 0 });
    const { container } = render(<LiveNowRail />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the live listing read fails (no error UI on a public feed)", async () => {
    mockList.mockRejectedValue(new Error("backend down"));
    const { container } = render(<LiveNowRail />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    // Give the rejected promise a tick to settle; the rail stays empty.
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders the rail with a card per live stream, each linking to its watch page", async () => {
    mockList.mockResolvedValue({
      total: 3,
      live_streams: [
        card("11111111-1111-1111-1111-111111111111", "Late-night color grading"),
        card("22222222-2222-2222-2222-222222222222", "Field diary, live", {
          channel_display_name: "North Loop",
          channel_handle: "northloop",
        }),
      ],
      limit: 20,
      offset: 0,
    });
    render(<LiveNowRail />);

    // Region landmark + heading + pluralized count.
    await screen.findByRole("heading", { name: "Live now" });
    expect(screen.getByRole("region", { name: "Live now" })).toBeTruthy();
    expect(screen.getByText("2 streams")).toBeTruthy();

    const first = screen.getByRole("link", { name: /Late-night color grading/ });
    expect(first.getAttribute("href")).toBe("/live/11111111-1111-1111-1111-111111111111");
    expect(screen.getByText("Aurora Lab")).toBeTruthy();

    const second = screen.getByRole("link", { name: /Field diary, live/ });
    expect(second.getAttribute("href")).toBe("/live/22222222-2222-2222-2222-222222222222");
    expect(screen.getByText("North Loop")).toBeTruthy();

    // The card's accessible name carries the live-now context and channel.
    expect(first.getAttribute("aria-label")).toBe(
      "Late-night color grading, live now — Aurora Lab",
    );
  });

  it("uses the singular label for a single live stream and requests a bounded page", async () => {
    mockList.mockResolvedValue({
      total: 1,
      live_streams: [card("33333333-3333-3333-3333-333333333333", "Solo stream")],
      limit: 20,
      offset: 0,
    });
    render(<LiveNowRail />);
    await screen.findByText("1 stream");
    // Bounded fetch (limit passed), abort signal wired.
    expect(mockList).toHaveBeenCalledWith({ limit: 20 }, expect.any(AbortSignal));
  });
});
