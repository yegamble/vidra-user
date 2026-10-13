// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ status: "authed" }) }));
vi.mock("@/components/CreateSheet", () => ({ CreateSheet: () => null }));
vi.mock("@/lib/api", () => ({
  api: { getUnreadNotificationCount: () => Promise.resolve({ unread_count: 3 }) },
}));

import { I18nProvider } from "./I18nProvider";
import { BottomTabBar } from "./BottomTabBar";

afterEach(cleanup);

describe("BottomTabBar labels", () => {
  it("renders the English labels unchanged by default", async () => {
    render(<BottomTabBar />);
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    for (const name of ["Home", "Search", "Create", "Library"]) {
      expect(screen.getByRole(name === "Create" ? "button" : "link", { name })).toBeTruthy();
    }
    expect(await screen.findByRole("link", { name: "Inbox (3 unread)" })).toBeTruthy();
  });

  it("renders a provided catalog, falling back to en per key", async () => {
    render(
      <I18nProvider locale="fr" messages={{ "nav.home": "Accueil", "nav.inbox.unread": "Boîte ({count} non lus)" }}>
        <BottomTabBar />
      </I18nProvider>,
    );
    expect(screen.getByRole("link", { name: "Accueil" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Search" })).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Boîte (3 non lus)" })).toBeTruthy();
  });
});
