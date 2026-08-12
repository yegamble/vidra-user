// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

let sessionStatus = "authed";
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    followChannel: vi.fn().mockResolvedValue(undefined),
    unfollowChannel: vi.fn().mockResolvedValue(undefined),
  },
}));

import { api } from "@/lib/api";

import { FollowButton } from "./FollowButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStatus = "authed";
});

describe("FollowButton", () => {
  it("prompts anonymous viewers to sign in", () => {
    sessionStatus = "anon";
    render(<FollowButton handle="grade-house" />);
    const link = screen.getByRole("link", { name: "Sign in to follow" });
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("follows then unfollows, nudging the follower count both ways", async () => {
    const onDelta = vi.fn();
    render(<FollowButton handle="grade-house" onDelta={onDelta} />);

    const btn = screen.getByRole("button", { name: "Follow" });
    fireEvent.click(btn);
    await waitFor(() => expect(api.followChannel).toHaveBeenCalledWith("grade-house"));
    await screen.findByRole("button", { name: "Following" });
    expect(onDelta).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Following" }));
    await waitFor(() => expect(api.unfollowChannel).toHaveBeenCalledWith("grade-house"));
    await screen.findByRole("button", { name: "Follow" });
    expect(onDelta).toHaveBeenLastCalledWith(-1);
  });

  it("initializes to Following when passed initialFollowing=true", () => {
    render(<FollowButton handle="grade-house" initialFollowing={true} />);
    expect(screen.getByRole("button", { name: "Following" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Follow" })).toBeNull();
  });
});
