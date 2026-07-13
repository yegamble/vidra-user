// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const session = vi.hoisted(() => ({
  value: { status: "anon", user: null, logout: vi.fn() } as Record<string, unknown>,
}));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => session.value }));

import { AccountMenu } from "./AccountMenu";

const user = {
  id: "00000000-0000-0000-0000-000000000001", username: "ada", email: "ada@example.test",
  role: "user", email_verified: true, display_name: "Ada", bio: "", history_enabled: true,
  profile_public: false, created_at: "2026-01-01T00:00:00Z", has_avatar: false,
};

beforeEach(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
  vi.stubGlobal("localStorage", storage);
  push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountMenu", () => {
  it("shows a sign-in button to anonymous visitors", () => {
    session.value = { status: "anon", user: null, logout: vi.fn() };
    render(<AccountMenu />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("opens an avatar menu with account destinations and device preferences", () => {
    session.value = { status: "authed", user, logout: vi.fn() };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByRole("dialog", { name: "Account menu" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Your profile/ }).getAttribute("href")).toBe("/users/ada?preview=1");
    expect(screen.getByRole("link", { name: "Studio" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText("Display language")).toBeTruthy();

    fireEvent.click(screen.getByRole("switch", { name: "Restricted Mode" }));
    expect(localStorage.getItem("vidra.restricted-mode")).toBe("true");
  });

  it("opens the keyboard reference and signs out from the menu", () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    session.value = { status: "authed", user: { ...user, profile_public: true }, logout };
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Keyboard shortcuts/ }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
