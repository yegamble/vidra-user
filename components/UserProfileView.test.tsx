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

// The session in context. null is the shipped default for this file: the view
// is rendered bare here, with no AuthProvider above it, which is exactly what
// useOptionalSession answers null for.
let optionalSession: { status: string; user: { id: string } | null } | null = null;
vi.mock("@/components/auth/AuthProvider", () => ({
  useOptionalSession: () => optionalSession,
}));

vi.mock("@/lib/format", () => ({
  formatCount: (n: number) => String(n),
  formatMonthYear: () => "Jul 2026",
  pluralize: (_n: number, word: string) => word,
}));

import { UserProfileLoader, UserProfileView } from "./UserProfileView";
import { api } from "@/lib/api";

const getUserProfile = vi.mocked(api.getUserProfile);
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

// GET /users/{username}/profile answers differently for the profile's OWNER:
// core resolves it from the account row rather than the public projection, and
// only that branch exposes the linked Bluesky handle. A read that goes out
// before the refresh cookie has been redeemed is anonymous, so an owner
// hard-loading their own profile got the visitor's view of it and the page
// never re-asked.
describe("UserProfileLoader session settling", () => {
  afterEach(() => {
    optionalSession = null;
  });

  it("does not read the profile while the session is still restoring", async () => {
    optionalSession = { status: "restoring", user: null };
    getUserProfile.mockResolvedValue(profile());
    render(<UserProfileLoader username="ada" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it("reads it exactly once when the session settles", async () => {
    optionalSession = { status: "restoring", user: null };
    getUserProfile.mockResolvedValue(profile());
    const { rerender } = render(<UserProfileLoader username="ada" />);
    optionalSession = { status: "authed", user: { id: "u1" } };
    rerender(<UserProfileLoader username="ada" />);
    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(getUserProfile).toHaveBeenCalledTimes(1);
  });
});
