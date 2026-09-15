// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

// The header's satellite widgets have their own suites and need auth/toast
// providers; this suite covers the W4 branding: logo slots + hide-name.
vi.mock("@/components/auth/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/NotificationsBell", () => ({ NotificationsBell: () => null }));
vi.mock("@/components/SearchAutocomplete", () => ({
  SearchAutocomplete: () => null,
  SearchAutocompleteFallback: () => null,
}));

import { Header } from "./Header";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import {
  SIDEBAR_ID,
  readCollapsed,
  readDrawerOpen,
  setCollapsed,
  setImmersive,
} from "@/lib/sidebar-state";

const API = "http://localhost:8080";

function snapshot(branding: Record<string, unknown>, name = "ExampleTube"): InstanceConfigSnapshot {
  return { name, branding } as InstanceConfigSnapshot;
}

const set = (url: string) => ({ url, is_fallback: false });
const unset = { url: "", is_fallback: true };

afterEach(() => {
  cleanup();
  pathname.value = "/";
  act(() => {
    setImmersive(false);
    setCollapsed(false);
  });
  window.localStorage.clear();
});

describe("Header branding", () => {
  it("renders the hardcoded wordmark with no snapshot (backend unreachable)", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Vidra" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the instance name from the snapshot while no logo is set", () => {
    render(<Header instance={snapshot({ logos: { header_wide: unset } })} />);
    expect(screen.getByRole("link", { name: "ExampleTube" })).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders a set wide logo beside the name, resolved against the API origin", () => {
    render(
      <Header
        instance={snapshot({ logos: { header_wide: set("/api/v1/instance/logo/header-wide") } })}
      />,
    );
    expect(screen.getByText("ExampleTube")).toBeTruthy();
    // One logo serves both breakpoints when only one slot is set (decorative
    // alt: the link's accessible name stays the visible instance name).
    const imgs = document.querySelectorAll("img");
    expect(imgs.length).toBe(2);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBe(`${API}/api/v1/instance/logo/header-wide`);
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("uses the uploaded instance avatar in the navbar when no header logo is set", () => {
    render(<Header instance={snapshot({ avatar: set("/api/v1/instance/avatar"), logos: {} })} />);
    const imgs = Array.from(document.querySelectorAll("img"));
    expect(imgs.length).toBe(2);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBe(`${API}/api/v1/instance/avatar`);
    }
  });

  it("uses header_square as the compact mark and header_wide for sm+ when both are set", () => {
    render(
      <Header
        instance={snapshot({
          logos: {
            header_wide: set("/api/v1/instance/logo/header-wide"),
            header_square: set("/api/v1/instance/logo/header-square"),
          },
        })}
      />,
    );
    const imgs = Array.from(document.querySelectorAll("img"));
    expect(imgs.length).toBe(2);
    const [phone, desktop] = imgs;
    expect(phone.getAttribute("src")).toBe(`${API}/api/v1/instance/logo/header-square`);
    expect(phone.className).toContain("sm:hidden");
    expect(desktop.getAttribute("src")).toBe(`${API}/api/v1/instance/logo/header-wide`);
    expect(desktop.className).toContain("sm:block");
  });

  it("hide_instance_name drops the text only when a logo exists (alt carries the name)", () => {
    render(
      <Header
        instance={snapshot({
          hide_instance_name: true,
          logos: { header_wide: set("/api/v1/instance/logo/header-wide") },
        })}
      />,
    );
    expect(screen.queryByText("ExampleTube")).toBeNull();
    const imgs = Array.from(document.querySelectorAll("img"));
    expect(imgs.length).toBe(2);
    for (const img of imgs) expect(img.getAttribute("alt")).toBe("ExampleTube");
  });

  it("never renders an empty header: hide_instance_name without a logo keeps the name", () => {
    render(<Header instance={snapshot({ hide_instance_name: true, logos: {} })} />);
    expect(screen.getByRole("link", { name: "ExampleTube" })).toBeTruthy();
  });

  // White-label (branding.hide_software_name): the wordmark's LAST fallback is
  // the software's own name, so the header is the one place a named-nothing
  // instance leaks it. The header must still never be empty.
  it("keeps the software wordmark when the software name is not hidden", () => {
    render(<Header instance={snapshot({ hide_software_name: false }, "")} />);
    expect(screen.getByRole("link", { name: "Vidra" })).toBeTruthy();
  });

  it("falls back to a neutral home label when hidden and the instance has no name", () => {
    render(<Header instance={snapshot({ hide_software_name: true }, "")} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeTruthy();
    expect(screen.queryByText("Vidra")).toBeNull();
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });

  it("still prefers the instance's own name when hidden", () => {
    render(<Header instance={snapshot({ hide_software_name: true })} />);
    expect(screen.getByRole("link", { name: "ExampleTube" })).toBeTruthy();
  });

  it("stays hidden on standalone routes", () => {
    pathname.value = "/embed/v1";
    const { container } = render(<Header instance={snapshot({})} />);
    expect(container.querySelector("header")).toBeNull();
  });
});

// The header Menu button is the shell's sidebar control (design-system.md: the
// desktop/tablet rail is toggled from the header; phones keep the BottomTabBar
// and no hamburger). It drives lib/sidebar-state directly, so it and the rail's
// own Collapse button can never disagree, and in an IMMERSIVE shell (theater) it
// opens the rail as an overlay drawer instead of un-collapsing it.
describe("Header Menu button", () => {
  it("renders left of the brand, labelled and wired to the sidebar", () => {
    render(<Header />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-controls")).toBe(SIDEBAR_ID);
    // Desktop/tablet only — phones keep the bottom tab bar.
    expect(menu.className).toContain("sm:inline-flex");
    expect(menu.className).toContain("hidden");
    const brand = screen.getByRole("link", { name: "Vidra" });
    expect(menu.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("toggles the shared collapse store and mirrors it in aria-expanded", () => {
    render(<Header />);
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    act(() => void fireEvent.click(menu));
    expect(readCollapsed()).toBe(true);
    expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("false");
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Menu" })));
    expect(readCollapsed()).toBe(false);
  });

  it("reflects a collapse made elsewhere (the rail's own toggle)", () => {
    render(<Header />);
    act(() => setCollapsed(true));
    expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the drawer instead of un-collapsing while the shell is immersive", () => {
    render(<Header />);
    act(() => setImmersive(true));
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    act(() => void fireEvent.click(menu));
    expect(readDrawerOpen()).toBe(true);
    expect(readCollapsed()).toBe(false); // the persisted preference is untouched
    expect(screen.getByRole("button", { name: "Menu" }).getAttribute("aria-expanded")).toBe("true");
    act(() => void fireEvent.click(screen.getByRole("button", { name: "Menu" })));
    expect(readDrawerOpen()).toBe(false);
  });

  it("is absent on standalone routes (no shell to toggle)", () => {
    pathname.value = "/login";
    render(<Header />);
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
  });
});
