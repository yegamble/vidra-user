// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

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

vi.mock("@/lib/api", () => ({
  videoThumbnailUrl: (id: string) => `/videos/${id}/thumbnail`,
  remoteVideoThumbnailUrl: (id: string) => `/remote/${id}/thumbnail`,
}));

import { FeaturedHero } from "./FeaturedHero";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    channel_handle: "studio",
    channel_display_name: "Studio",
    title: "A considered first frame",
    description: "",
    privacy: "public",
    state: "published",
    created_at: "2026-07-13T12:00:00Z",
    has_thumbnail: true,
    views: 1200,
    ...overrides,
  } as Video;
}

afterEach(cleanup);

describe("FeaturedHero", () => {
  it("renders the featured title as a heading linking to the local watch page", () => {
    render(<FeaturedHero video={video()} />);

    const heading = screen.getByRole("heading", { name: "A considered first frame" });
    expect(heading).toBeTruthy();
    // The whole hero is one watch link (accessible name = the title).
    const link = screen.getByRole("link", { name: "A considered first frame" });
    expect(link.getAttribute("href")).toBe("/videos/v1");
    // Channel + a views figure ride the meta line.
    expect(screen.getByText("Studio", { exact: false })).toBeTruthy();
    expect(screen.getByText(/1\.2K views/)).toBeTruthy();
  });

  it("points a federated hero at the remote watch surface", () => {
    render(
      <FeaturedHero
        video={video({ id: "rv9", remote: true, channel_display_name: "Remote Studio" })}
      />,
    );
    const link = screen.getByRole("link", { name: "A considered first frame" });
    expect(link.getAttribute("href")).toBe("/remote/rv9");
  });

  it("falls back to a placeholder when the video has no thumbnail", () => {
    const { container } = render(<FeaturedHero video={video({ has_thumbnail: false })} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".media-placeholder")).not.toBeNull();
  });
});
