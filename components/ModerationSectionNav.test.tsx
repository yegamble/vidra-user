// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The admin console registry (lib/admin-nav.ts) canonically names /moderation
// "Queues" and /moderation/videos "Content". This rail used to call the same
// routes "Reports" and "All videos" — an admin tapping "Queues" landed on a
// rail highlighting "Reports", and inside moderation the shield glyph meant
// Quarantine while the console used it for Queues. These tests pin the rail to
// the registry's vocabulary, and cover the admin-only way back to the console
// (the rail has no other route to /admin, and AdminTabs renders on /admin
// pages only — a phone admin following a console link-out was stranded).

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

const nav = vi.hoisted(() => ({ pathname: "/moderation", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: session.user }),
}));

import { ModerationSectionNav } from "./ModerationSectionNav";
import { ADMIN_NAV } from "@/lib/admin-nav";

beforeEach(() => {
  session.user = { id: "u1", role: "moderator" };
  nav.pathname = "/moderation";
  nav.push.mockClear();
});
afterEach(cleanup);

describe("ModerationSectionNav", () => {
  it("names the console's link-out destinations exactly as the registry does", () => {
    render(<ModerationSectionNav />);
    const rail = screen.getByRole("navigation", { name: "Moderation sections" });
    for (const item of ADMIN_NAV.filter((i) => i.external)) {
      expect(within(rail).getByRole("link", { name: item.label }).getAttribute("href")).toBe(
        item.href,
      );
    }
    // The synonyms the drift produced must be gone.
    expect(within(rail).queryByRole("link", { name: "Reports" })).toBe(null);
    expect(within(rail).queryByRole("link", { name: "All videos" })).toBe(null);
  });

  it("keeps every moderation surface reachable from the rail", () => {
    render(<ModerationSectionNav />);
    const rail = screen.getByRole("navigation", { name: "Moderation sections" });
    for (const href of [
      "/moderation",
      "/moderation/quarantine",
      "/moderation/blocked",
      "/moderation/videos",
      "/moderation/comments",
      "/moderation/watched-words",
      "/moderation/watched-word-matches",
      "/moderation/instances",
    ]) {
      expect(
        within(rail)
          .getAllByRole("link")
          .some((a) => a.getAttribute("href") === href),
      ).toBe(true);
    }
  });

  it("offers admins a way back to the console, on the rail and the mobile switcher", () => {
    session.user = { id: "u1", role: "admin" };
    render(<ModerationSectionNav />);
    expect(screen.getByRole("link", { name: "Admin console" }).getAttribute("href")).toBe(
      "/admin",
    );
    fireEvent.click(screen.getByRole("button", { name: /Moderation section:/ }));
    expect(screen.getByRole("menuitem", { name: "Admin console" }).getAttribute("href")).toBe(
      "/admin",
    );
  });

  it("hides the console back-link from moderators without admin", () => {
    render(<ModerationSectionNav />);
    expect(screen.queryByRole("link", { name: "Admin console" })).toBe(null);
    fireEvent.click(screen.getByRole("button", { name: /Moderation section:/ }));
    expect(screen.queryByRole("menuitem", { name: "Admin console" })).toBe(null);
  });

  it("renders nothing for a regular viewer", () => {
    session.user = { id: "u1", role: "user" };
    const { container } = render(<ModerationSectionNav />);
    expect(container.innerHTML).toBe("");
  });
});
