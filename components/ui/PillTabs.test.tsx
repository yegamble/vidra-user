// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PillTabs, type PillTabItem } from "./PillTabs";

let pathname = "/settings/mutes";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const TABS: readonly PillTabItem[] = [
  { href: "/settings/mutes", label: "Accounts" },
  { href: "/settings/mutes/instances", label: "Instances" },
];

beforeEach(() => {
  pathname = "/settings/mutes";
});
afterEach(cleanup);

describe("PillTabs", () => {
  it("names the nav landmark and links every tab", () => {
    render(<PillTabs tabs={TABS} label="Mute types" />);
    expect(screen.getByRole("navigation", { name: "Mute types" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Instances" }).getAttribute("href")).toBe(
      "/settings/mutes/instances",
    );
  });

  it("marks only the current route as the current page", () => {
    render(<PillTabs tabs={TABS} label="Mute types" />);
    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Instances" }).getAttribute("aria-current")).toBeNull();
  });

  it("fills the active pill and outlines the rest", () => {
    render(<PillTabs tabs={TABS} label="Mute types" />);
    expect(screen.getByRole("link", { name: "Accounts" }).className).toContain("bg-accent");
    expect(screen.getByRole("link", { name: "Instances" }).className).toContain("border-border");
  });

  // Exact equality, not a prefix: "/settings/mutes" is a prefix of the
  // instances route, and a prefix match would light up both pills there.
  it("does not light the parent pill on a sibling route", () => {
    pathname = "/settings/mutes/instances";
    render(<PillTabs tabs={TABS} label="Mute types" />);
    expect(screen.getByRole("link", { name: "Accounts" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Instances" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("takes its margin from the caller", () => {
    render(<PillTabs tabs={TABS} label="Mute types" className="mb-4" />);
    const nav = screen.getByRole("navigation", { name: "Mute types" });
    expect(nav.className).toContain("mb-4");
    expect(nav.className).toContain("flex flex-wrap gap-2");
  });
});
