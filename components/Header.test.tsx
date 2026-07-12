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

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

// The header's satellite widgets have their own suites and need auth/toast
// providers; this suite covers the W4 branding: logo slots + hide-name.
vi.mock("@/components/auth/AccountMenu", () => ({ AccountMenu: () => null }));
vi.mock("@/components/NotificationsBell", () => ({ NotificationsBell: () => null }));
vi.mock("@/components/SearchBox", () => ({ SearchBox: () => null }));

import { Header } from "./Header";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

const API = "http://localhost:8080";

function snapshot(branding: Record<string, unknown>, name = "ExampleTube"): InstanceConfigSnapshot {
  return { name, branding } as InstanceConfigSnapshot;
}

const set = (url: string) => ({ url, is_fallback: false });
const unset = { url: "", is_fallback: true };

afterEach(() => {
  cleanup();
  pathname.value = "/";
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

  it("stays hidden on standalone routes", () => {
    pathname.value = "/embed/v1";
    const { container } = render(<Header instance={snapshot({})} />);
    expect(container.querySelector("header")).toBeNull();
  });
});
