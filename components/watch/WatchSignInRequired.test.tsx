// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ wall: false }));

vi.mock("@/lib/use-sensitive-sign-in-wall", () => ({
  useSensitiveSignInWall: () => mocks.wall,
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: null, status: "anon" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/videos/v1",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { WatchSignInRequired } from "./WatchSignInRequired";

afterEach(cleanup);

describe("WatchSignInRequired", () => {
  it("says the instance asks for an account when the sensitive sign-in wall is up", () => {
    mocks.wall = true;
    render(<WatchSignInRequired />);
    expect(screen.getByText("Sign in to watch this video")).toBeTruthy();
    expect(screen.getByText(/shows sensitive and members-only videos to signed-in people only/)).toBeTruthy();
    expect(screen.queryByText(/only visible to people signed in to this instance/)).toBeNull();
  });

  it("keeps the members-only wording when the wall is down", () => {
    mocks.wall = false;
    render(<WatchSignInRequired />);
    expect(screen.getByText(/only visible to people signed in to this instance/)).toBeTruthy();
    expect(screen.queryByText(/sensitive and members-only/)).toBeNull();
  });
});
