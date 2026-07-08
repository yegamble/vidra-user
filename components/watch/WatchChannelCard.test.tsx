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

// Anonymous session so the Follow control resolves to a sign-in link (no network).
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon" }),
}));

import { WatchChannelCard } from "./WatchChannelCard";

afterEach(cleanup);

describe("WatchChannelCard", () => {
  it("links to the channel, shows the follower count, and offers Follow", () => {
    render(
      <WatchChannelCard handle="grade-house" name="Grade House" followerCount={48200} />,
    );
    const link = screen.getByRole("link", { name: /Grade House/ });
    expect(link.getAttribute("href")).toBe("/channels/grade-house");
    expect(screen.getByText("48.2K followers")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in to follow" })).toBeTruthy();
  });

  it("omits the follower line when the count is not yet known (never fabricated)", () => {
    render(<WatchChannelCard handle="grade-house" name="Grade House" followerCount={null} />);
    expect(screen.getByText("Grade House")).toBeTruthy();
    expect(screen.queryByText(/followers/)).toBeNull();
  });
});
