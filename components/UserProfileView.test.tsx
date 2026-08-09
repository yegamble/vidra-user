// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: { getUserProfile: vi.fn() },
  channelAvatarUrl: () => "",
  userAvatarUrl: () => "",
  userBannerUrl: () => "",
}));

vi.mock("@/lib/format", () => ({
  formatCount: (n: number) => String(n),
  formatMonthYear: () => "Jul 2026",
  pluralize: (_n: number, word: string) => word,
}));

import { UserProfileView } from "./UserProfileView";
import type { PublicUserProfile } from "@/lib/api";

function profile(overrides: Partial<PublicUserProfile> = {}): PublicUserProfile {
  return {
    id: "u1",
    username: "ada",
    display_name: "Ada",
    bio: "",
    created_at: new Date("2026-07-01").toISOString(),
    has_avatar: false,
    has_banner: false,
    channels: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("UserProfileView Bluesky row", () => {
  it("links the handle to bsky.app when bluesky_handle is present", () => {
    render(<UserProfileView profile={profile({ bluesky_handle: "ada.bsky.social" })} />);
    // The About section holds the details list.
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    const link = screen.getByRole("link", { name: "@ada.bsky.social" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://bsky.app/profile/ada.bsky.social");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("omits the Bluesky row when no handle is present", () => {
    render(<UserProfileView profile={profile()} />);
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    expect(screen.queryByText("Bluesky")).toBeNull();
    expect(screen.queryByRole("link", { name: /bsky/i })).toBeNull();
  });
});
