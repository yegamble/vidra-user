// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpNextQueue } from "./UpNextQueue";
import type { Video } from "@/lib/api";
import { enqueueVideo, resetVideoQueueForTests } from "@/lib/video-queue";

// next/link renders a plain anchor in tests — no App Router context needed, and
// href assertions read straight off the <a>.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

function video(id: string, over: Partial<Video> = {}): Video {
  return {
    id,
    channel_id: "channel-1",
    title: `Video ${id}`,
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-01-01T00:00:00Z",
    has_thumbnail: false,
    ...over,
  } as Video;
}

beforeEach(() => {
  resetVideoQueueForTests();
});

afterEach(() => {
  cleanup();
  resetVideoQueueForTests();
});

describe("UpNextQueue", () => {
  it("renders nothing when the queue is empty", () => {
    const { container } = render(<UpNextQueue currentVideo={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("upnext-queue")).toBeNull();
  });

  it("renders one row per queued video with the correct watch hrefs", () => {
    act(() => {
      enqueueVideo(video("a", { title: "Alpha", channel_display_name: "Chan A" }));
      enqueueVideo(video("b", { title: "Beta", remote: true }));
    });
    render(<UpNextQueue currentVideo={null} />);

    expect(screen.getByTestId("upnext-queue")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Up next/ })).toBeTruthy();
    expect(screen.getAllByTestId("upnext-row")).toHaveLength(2);
    // Local → /videos/{id}; remote → /remote/{id} (nextVideoHref semantics).
    expect(screen.getByRole("link", { name: "Alpha" }).getAttribute("href")).toBe("/videos/a");
    expect(screen.getByRole("link", { name: "Beta" }).getAttribute("href")).toBe("/remote/b");
    expect(screen.getByText("Chan A")).toBeTruthy();
  });

  it("excludes the currently playing video the way the end card's next-pick does", () => {
    act(() => {
      enqueueVideo(video("a", { title: "Alpha" }));
      enqueueVideo(video("cur", { title: "Current" }));
    });
    render(<UpNextQueue currentVideo={video("cur", { title: "Current" })} />);

    expect(screen.getAllByTestId("upnext-row")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Alpha" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Current" })).toBeNull();
  });

  it("removes a single row via its remove button", () => {
    act(() => {
      enqueueVideo(video("a", { title: "Alpha" }));
      enqueueVideo(video("b", { title: "Beta" }));
    });
    render(<UpNextQueue currentVideo={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Alpha from the queue" }));
    expect(screen.getAllByTestId("upnext-row")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Alpha" })).toBeNull();
    expect(screen.getByRole("link", { name: "Beta" })).toBeTruthy();
  });

  it("clears the whole queue via Clear all (the panel then collapses)", () => {
    act(() => {
      enqueueVideo(video("a"));
      enqueueVideo(video("b"));
    });
    render(<UpNextQueue currentVideo={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.queryByTestId("upnext-queue")).toBeNull();
  });
});
