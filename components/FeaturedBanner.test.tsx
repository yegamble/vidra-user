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

import { FeaturedBanner } from "./FeaturedBanner";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "vid-1",
    remote: false,
    title: "The Video's Own Title",
    description: "The video's own description.",
    privacy: "public",
    state: "published",
    is_sensitive: false,
    created_at: new Date().toISOString(),
    has_thumbnail: true,
    channel_handle: "ada",
    channel_display_name: "Ada Makes",
    ...overrides,
  } as Video;
}

afterEach(cleanup);

describe("FeaturedBanner", () => {
  it("falls back to the video's own fields when no overrides are given", () => {
    render(<FeaturedBanner video={video()} label="featured" />);

    expect(screen.getByRole("heading", { name: "The Video's Own Title" })).toBeTruthy();
    expect(screen.getByText("The video's own description.")).toBeTruthy();
    // Default CTA label.
    expect(screen.getByText("Watch now")).toBeTruthy();
    // Channel attribution.
    expect(screen.getByText("Ada Makes")).toBeTruthy();
  });

  it("prefers the admin overrides over the video fields", () => {
    render(
      <FeaturedBanner
        video={video()}
        title="Editor's Override Title"
        description="A punchy override blurb."
        ctaLabel="Watch the premiere"
        label="featured"
      />,
    );

    expect(screen.getByRole("heading", { name: "Editor's Override Title" })).toBeTruthy();
    expect(screen.getByText("A punchy override blurb.")).toBeTruthy();
    expect(screen.getByText("Watch the premiere")).toBeTruthy();
    // The video's own title/description no longer show.
    expect(screen.queryByText("The Video's Own Title")).toBeNull();
    expect(screen.queryByText("The video's own description.")).toBeNull();
  });

  it("treats blank overrides as unset (falls back to video fields)", () => {
    render(
      <FeaturedBanner video={video()} title="   " description="" ctaLabel="  " label="featured" />,
    );
    expect(screen.getByRole("heading", { name: "The Video's Own Title" })).toBeTruthy();
    expect(screen.getByText("The video's own description.")).toBeTruthy();
    expect(screen.getByText("Watch now")).toBeTruthy();
  });

  it("shows the Featured chip by default and the Sponsored chip for the sponsored label", () => {
    const { rerender } = render(<FeaturedBanner video={video()} label="featured" />);
    expect(screen.getByText("Featured")).toBeTruthy();
    expect(screen.queryByText("Sponsored")).toBeNull();

    rerender(<FeaturedBanner video={video()} label="sponsored" />);
    expect(screen.getByText("Sponsored")).toBeTruthy();
    expect(screen.queryByText("Featured")).toBeNull();
  });

  it("links the media and the CTA to the watch page", () => {
    render(<FeaturedBanner video={video({ id: "abc-123" })} label="featured" />);
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/videos/abc-123");
    // The media surface and the CTA button both point at the watch page.
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it("renders a placeholder (no poster img) when the video has no thumbnail", () => {
    const { container } = render(
      <FeaturedBanner video={video({ has_thumbnail: false })} label="featured" />,
    );
    expect(container.querySelector('img[src*="/thumbnail"]')).toBeNull();
    expect(container.querySelector(".media-placeholder")).not.toBeNull();
  });

  it("renders an eager, high-priority poster when the video has a thumbnail", () => {
    const { container } = render(<FeaturedBanner video={video({ id: "poster-1" })} label="featured" />);
    const poster = container.querySelector('img[src*="/videos/poster-1/thumbnail"]');
    expect(poster).not.toBeNull();
    expect(poster?.getAttribute("loading")).toBe("eager");
  });
});
