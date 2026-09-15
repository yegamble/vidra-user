// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Settings rail must speak the app's own nav language.
//
// It used to lead every row with a colored `IconTile` — the iOS System Settings
// square — which no other navigation in the app uses: the Sidebar, StudioNav,
// AdminConsole rail and ModerationSectionNav all render a plain monochrome
// stroke icon that is `text-fg-muted` at rest and takes the row's
// `text-accent-text` when active. Eleven saturated tiles in a column the app
// otherwise draws in one hue read as a foreign surface. These tests pin the
// shared idiom so the tile cannot come back, and pin the parts of the rail the
// e2e specs navigate by (the sr-only "Manage …" names) so the restyle cannot
// quietly break them.

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

const nav = vi.hoisted(() => ({ pathname: "/settings" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const session = vi.hoisted(() => ({
  user: null as { id: string; username: string; role: string } | null,
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: session.user }),
}));

import { SettingsRail } from "./SettingsRail";
import { SETTINGS_GROUPS, SETTINGS_PROFILE } from "./sections";

const ALL = [SETTINGS_PROFILE, ...SETTINGS_GROUPS.flatMap((g) => g.items)];

beforeEach(() => {
  session.user = { id: "u1", username: "ada", role: "user" };
  nav.pathname = "/settings";
});
afterEach(cleanup);

function rail() {
  return screen.getByRole("navigation", { name: "Settings" });
}

describe("SettingsRail", () => {
  it("renders every catalog destination, grouped, for a signed-in viewer", () => {
    render(<SettingsRail />);
    expect(
      within(rail())
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(ALL.map((i) => i.href));
    for (const group of SETTINGS_GROUPS) {
      expect(within(rail()).getByRole("heading", { name: group.label })).toBeTruthy();
    }
  });

  it("keeps the sr-only 'Manage …' names the e2e specs navigate by", () => {
    render(<SettingsRail />);
    for (const item of SETTINGS_GROUPS.flatMap((g) => g.items)) {
      expect(
        within(rail()).getByRole("link", { name: new RegExp(item.action) }).getAttribute("href"),
      ).toBe(item.href);
    }
  });

  it("draws each icon plain — no colored tile wrapper anywhere in the rail", () => {
    render(<SettingsRail />);
    const el = rail();
    // The tile was a `bg-tile-*` rounded square holding a `text-white` glyph.
    expect(el.querySelectorAll('[class*="bg-tile-"]')).toHaveLength(0);
    expect(el.querySelectorAll('[class*="text-white"]')).toHaveLength(0);
    // One icon per row, and it is the link's own child — not wrapped in a span.
    const links = within(el).getAllByRole("link");
    expect(links).toHaveLength(ALL.length);
    for (const link of links) {
      const svgs = link.querySelectorAll("svg");
      expect(svgs).toHaveLength(1);
      expect(svgs[0].parentElement).toBe(link);
      // The app's nav icon size (Sidebar / ModerationSectionNav both use 18).
      expect(svgs[0].getAttribute("width")).toBe("18");
      expect(svgs[0].getAttribute("height")).toBe("18");
    }
  });

  it("tints the active row's icon with the accent and leaves the rest muted", () => {
    nav.pathname = "/settings/mutes";
    render(<SettingsRail />);
    const active = within(rail()).getByRole("link", { name: /Manage muted accounts/ });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("text-accent-text");
    expect(active.querySelector("svg")?.getAttribute("class")).toContain("text-accent-text");

    const inactive = within(rail()).getByRole("link", { name: /Manage playback settings/ });
    expect(inactive.getAttribute("aria-current")).toBe(null);
    expect(inactive.querySelector("svg")?.getAttribute("class")).toContain("text-fg-muted");
  });

  it("lights a sub-route through its parent row (activePaths)", () => {
    nav.pathname = "/settings/blocks/remote";
    render(<SettingsRail />);
    expect(
      within(rail()).getByRole("link", { name: /Manage blocked accounts/ }).getAttribute("aria-current"),
    ).toBe("page");
    // The index row is exact, so /settings never stays lit on a sub-page.
    expect(
      within(rail()).getByRole("link", { name: "Profile" }).getAttribute("aria-current"),
    ).toBe(null);
  });

  it("self-hides for an anonymous viewer", () => {
    session.user = null;
    const { container } = render(<SettingsRail />);
    expect(container.innerHTML).toBe("");
  });
});
