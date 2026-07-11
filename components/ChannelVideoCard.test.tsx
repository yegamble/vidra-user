// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

// This card suite covers card layout/content. The action-menu behavior has its
// own focused suite and otherwise requires router/auth/toast providers here.
vi.mock("@/components/VideoActionsMenu", () => ({
  VideoActionsMenu: () => null,
}));

import { ChannelVideoCard } from "./ChannelVideoCard";
import type { Video } from "@/lib/api";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    channel_id: "c1",
    title: "Monochrome grading — the luxury look, by hand",
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date().toISOString(),
    views: 96_000,
    has_thumbnail: false,
    duration_seconds: 1900,
    ...overrides,
  } as Video;
}

afterEach(cleanup);

describe("ChannelVideoCard", () => {
  it("links to the watch page, shows the title as a heading, views and duration", () => {
    render(<ChannelVideoCard video={video()} />);
    const heading = screen.getByRole("heading", {
      name: "Monochrome grading — the luxury look, by hand",
    });
    expect(heading).toBeTruthy();
    // The title heading wraps a link to the watch page.
    expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe("/videos/v1");
    expect(screen.getByText("96K views")).toBeTruthy();
    expect(screen.getByText("31:40")).toBeTruthy();
  });

  it("omits the duration chip for a zero/sub-second clip (noise, not info)", () => {
    render(<ChannelVideoCard video={video({ duration_seconds: 0 })} />);
    expect(screen.queryByText(/:/)).toBeNull();
  });

  it("omits the views line when the count is absent (never fabricated)", () => {
    render(<ChannelVideoCard video={video({ views: undefined })} />);
    expect(screen.queryByText(/views/)).toBeNull();
  });
});
