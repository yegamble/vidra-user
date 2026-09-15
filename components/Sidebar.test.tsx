// @vitest-environment jsdom
//
// Sidebar placements. The rail has ONE panel and two placements: the in-flow
// glass rail (the default) and, while a page asks for an immersive shell
// (theater mode on the watch page), an overlay DRAWER that is closed by default.
// The drawer is the only reason the rail may disappear on a page that has one,
// so the closed-immersive case is asserted explicitly: a viewer in theater must
// not be left with navigation they cannot reach.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const pathname = vi.hoisted(() => ({ value: "/videos/v1" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ user: null }) }));
vi.mock("@/lib/messaging/availability", () => ({ useMessagingAvailable: () => true }));
vi.mock("@/components/SidebarFollowing", () => ({ SidebarFollowing: () => null }));

import { Sidebar } from "./Sidebar";
import {
  SIDEBAR_ID,
  readDrawerOpen,
  setCollapsed,
  setDrawerOpen,
  setImmersive,
} from "@/lib/sidebar-state";

beforeEach(() => {
  pathname.value = "/videos/v1";
});

afterEach(() => {
  cleanup();
  act(() => {
    setImmersive(false);
    setDrawerOpen(false);
    setCollapsed(false);
  });
  window.localStorage.clear();
});

describe("Sidebar — in-flow rail (the default placement)", () => {
  it("renders the primary nav with the shell id the Menu button controls", () => {
    render(<Sidebar />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.id).toBe(SIDEBAR_ID);
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    // No overlay furniture in the default placement.
    expect(document.querySelector("[data-testid='sidebar-scrim']")).toBeNull();
  });

  it("reads the shared collapse store, so the header button and its own toggle agree", () => {
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
    act(() => setCollapsed(true));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });
});

describe("Sidebar — immersive (theater) placement", () => {
  it("renders nothing while the drawer is closed", () => {
    render(<Sidebar />);
    act(() => setImmersive(true));
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(document.querySelector("[data-testid='sidebar-scrim']")).toBeNull();
  });

  it("renders the same panel as a drawer over a scrim when opened", () => {
    render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav.id).toBe(SIDEBAR_ID);
    // The same link list — not a forked one.
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Studio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
    expect(document.querySelector("[data-testid='sidebar-scrim']")).not.toBeNull();
  });

  it("moves focus to the first link on open", () => {
    render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Home" }));
  });

  it("closes on a scrim click and returns focus to the header Menu button", () => {
    const opener = document.createElement("button");
    opener.setAttribute("data-sidebar-menu-button", "");
    document.body.appendChild(opener);
    render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    const scrim = document.querySelector("[data-testid='sidebar-scrim']")!;
    act(() => void fireEvent.click(scrim));
    expect(readDrawerOpen()).toBe(false);
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("closes on Escape", () => {
    render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    act(() => void fireEvent.keyDown(document, { key: "Escape" }));
    expect(readDrawerOpen()).toBe(false);
  });

  it("closes when the route changes", () => {
    const { rerender } = render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    expect(readDrawerOpen()).toBe(true);
    pathname.value = "/trending";
    act(() => rerender(<Sidebar />));
    expect(readDrawerOpen()).toBe(false);
  });

  it("stays absent on a standalone route even when the drawer flag is set", () => {
    pathname.value = "/login";
    render(<Sidebar />);
    act(() => {
      setImmersive(true);
      setDrawerOpen(true);
    });
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
  });
});
