// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  featureEnabled: false,
  preferenceEnabled: false,
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

vi.mock("@/components/VideoCardPreview", () => ({
  VideoCardPreview: (props: Record<string, unknown>) => {
    mocks.previewProps = props;
    return <div data-testid="preview-integration">{props.overlay as React.ReactNode}</div>;
  },
}));

vi.mock("@/components/VideoActionsMenu", () => ({
  VideoActionsMenu: () => <button aria-label="Card actions">Actions</button>,
}));

vi.mock("@/components/ui/Avatar", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/lib/instance-features", () => ({
  useInstanceFeatures: () => ({ video_card_previews: mocks.featureEnabled }),
}));

vi.mock("@/lib/player-settings", () => ({
  usePlayerSettings: () => ({ video_card_previews_enabled: mocks.preferenceEnabled }),
}));

vi.mock("@/lib/instance-defaults", () => ({
  useInstanceDefaults: () => null,
}));

vi.mock("@/lib/use-sensitive-policy", () => ({
  useSensitiveContentPolicy: () => "display",
}));

vi.mock("@/lib/device-preferences", () => ({
  useRestrictedMode: () => false,
}));

import { VideoCard } from "./VideoCard";

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: "v1",
    remote: false,
    channel_id: "c1",
    channel_handle: "films",
    channel_display_name: "Films",
    title: "A previewable film",
    description: "",
    privacy: "public",
    state: "published",
    is_sensitive: false,
    created_at: "2026-07-13T12:00:00Z",
    duration_seconds: 120,
    has_thumbnail: true,
    views: 3,
    ...overrides,
  } as Video;
}

beforeEach(() => {
  mocks.featureEnabled = false;
  mocks.preferenceEnabled = false;
  mocks.previewProps = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VideoCard preview integration", () => {
  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])("does not expose a media source unless admin=%s and user=%s", (admin, user) => {
    mocks.featureEnabled = admin;
    mocks.preferenceEnabled = user;

    render(<VideoCard video={video()} />);

    expect(mocks.previewProps?.previewEnabled).toBe(false);
    expect(mocks.previewProps?.src).toBeNull();
  });

  it("enables a local published preview only when both opt-ins are true", () => {
    mocks.featureEnabled = true;
    mocks.preferenceEnabled = true;

    render(<VideoCard video={video()} />);

    expect(mocks.previewProps?.previewEnabled).toBe(true);
    expect(String(mocks.previewProps?.src)).toMatch(/\/api\/v1\/videos\/v1\/original$/);
    expect(mocks.previewProps?.hasStoryboard).toBe(true);
  });

  it("passes above-the-fold poster priority into the shared preview", () => {
    render(<VideoCard video={video()} priority />);
    expect(mocks.previewProps?.posterPriority).toBe(true);
  });

  it("keeps federated cards poster-only until their HLS-capable preview path exists", () => {
    mocks.featureEnabled = true;
    mocks.preferenceEnabled = true;

    render(
      <VideoCard
        video={video({
          remote: true,
          channel_id: undefined,
          domain: "remote.example",
          stream_url: "https://remote.example/video/master.m3u8",
        })}
      />,
    );

    expect(mocks.previewProps?.previewEnabled).toBe(false);
    expect(mocks.previewProps?.src).toBeNull();
  });

  it("reveals the larger overflow action only on hover/focus while reserving its space", () => {
    render(<VideoCard video={video()} />);

    const wrapper = screen.getByRole("button", { name: "Card actions" }).parentElement;
    expect(wrapper?.className).toContain("opacity-0");
    expect(wrapper?.className).toContain("group-hover/card:opacity-100");
    expect(wrapper?.className).toContain("group-focus-within/card:opacity-100");
  });
});

describe("VideoCard metadata", () => {
  it("stacks the channel link over a separate views/age line", () => {
    render(<VideoCard video={video({ views: 3 })} />);

    // The channel is its own link to the channel route…
    const channel = screen.getByRole("link", { name: "Films" });
    expect(channel.getAttribute("href")).toBe("/channels/films");

    // …and the views/age line is a DISTINCT element, not concatenated onto the
    // channel line (the two are stacked, YouTube-style).
    const meta = screen.getByText(/3 views/);
    expect(meta.textContent).not.toContain("Films");
    expect(meta).not.toBe(channel);
  });

  it("shows the local channel name as a link, remote identity as plain text", () => {
    const { rerender } = render(<VideoCard video={video()} />);
    expect(screen.getByRole("link", { name: "Films" })).toBeTruthy();

    rerender(
      <VideoCard
        video={video({
          remote: true,
          channel_id: undefined,
          channel_handle: "ada@remote.example",
          channel_display_name: "Ada Remote",
          domain: "remote.example",
        })}
      />,
    );
    // A federated card credits the "name@domain" identity without a local link.
    expect(screen.getByText("Ada Remote")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ada Remote" })).toBeNull();
  });
});
