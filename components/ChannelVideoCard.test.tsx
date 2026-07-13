// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  previewProps: null as Record<string, unknown> | null,
}));

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

vi.mock("@/components/VideoCardPreview", () => ({
  VideoCardPreview: (props: {
    href: string;
    title: string;
    overlay?: React.ReactNode;
    posterClassName?: string;
    previewEnabled?: boolean;
  }) => {
    mocks.previewProps = props;
    return <a href={props.href} aria-label={props.title}>
      {props.overlay}
    </a>
  },
}));

vi.mock("@/lib/instance-features", () => ({
  useInstanceFeatures: () => ({ video_card_previews: true }),
}));

vi.mock("@/lib/player-settings", () => ({
  usePlayerSettings: () => ({ video_card_previews_enabled: true }),
}));

vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => "blur",
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => false,
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

afterEach(() => {
  cleanup();
  mocks.previewProps = null;
});

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

  it("keeps sensitive channel cards blurred and labeled instead of autoplaying them", () => {
    render(<ChannelVideoCard video={video({ is_sensitive: true, has_thumbnail: true })} />);
    expect(screen.getByText("Sensitive")).toBeTruthy();
    expect(mocks.previewProps?.posterClassName).toContain("blur-2xl");
    expect(mocks.previewProps?.previewEnabled).toBe(false);
  });
});
