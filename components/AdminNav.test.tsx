// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Drift guard for the admin navigation registry (lib/admin-nav.ts).
//
// Three surfaces render admin navigation — the desktop rail (AdminConsole), the
// `<lg` section Select (AdminTabs), and the /admin index's "Manage" list
// (AdminOverview). They used to be three hand-maintained arrays and they had
// already diverged: the Select carried NO moderation destination (the rail that
// does is `lg:`-only, so a phone-bound admin had no route to the report queue),
// and the Manage list was four pages behind the rail. These tests assert each
// surface is derived from the registry, so the next destination added there
// cannot go missing from one of them.

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

const nav = vi.hoisted(() => ({ pathname: "/admin", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

const session = vi.hoisted(() => ({
  user: null as { id: string; username: string; display_name?: string; role: string } | null,
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ user: session.user }),
}));

// This suite is about navigation, not dashboards: every admin read hangs, so
// the cards stay in their loading state and no mocked promise ever rejects.
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  const pending = () => new Promise<never>(() => {});
  return {
    ...actual,
    api: {
      ...actual.api,
      getReports: pending,
      getSystemStatus: pending,
      getAdminStats: pending,
      getJobs: pending,
      getAuditLog: pending,
    },
  };
});

import { AdminConsole } from "./AdminConsole";
import { AdminOverview } from "./AdminOverview";
import { AdminTabs } from "./AdminTabs";
import {
  ADMIN_NAV,
  ADMIN_NAV_MORE,
  ADMIN_NAV_OVERVIEW,
  ADMIN_NAV_PRIMARY,
} from "@/lib/admin-nav";

const admin = { id: "u1", username: "boss", display_name: "Boss", role: "admin" };

beforeEach(() => {
  session.user = { ...admin };
  nav.pathname = "/admin";
  nav.push.mockClear();
});
afterEach(cleanup);

describe("admin nav registry", () => {
  it("keeps the design's grouping: a small icon-bearing primary group, a label-only More group", () => {
    // Progressive disclosure is the point of the split — if "primary" ever
    // swells, the rail stops being a rail.
    expect(ADMIN_NAV_PRIMARY.length).toBeLessThanOrEqual(5);
    expect(ADMIN_NAV_PRIMARY.every((item) => item.Icon !== undefined)).toBe(true);
    expect(ADMIN_NAV_MORE.every((item) => item.Icon === undefined)).toBe(true);
    expect([...ADMIN_NAV_PRIMARY, ...ADMIN_NAV_MORE].map((i) => i.href)).toEqual(
      ADMIN_NAV.map((i) => i.href),
    );
  });

  it("declares each destination once, with one label and one description", () => {
    expect(new Set(ADMIN_NAV.map((i) => i.href)).size).toBe(ADMIN_NAV.length);
    expect(new Set(ADMIN_NAV.map((i) => i.label)).size).toBe(ADMIN_NAV.length);
    expect(ADMIN_NAV.every((i) => i.label !== "" && i.description !== "")).toBe(true);
  });
});

describe("AdminConsole rail", () => {
  it("renders every registry entry, primary group first", () => {
    render(<AdminConsole />);
    const rail = screen.getByRole("navigation", { name: "Admin console" });
    const links = within(rail).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(ADMIN_NAV.map((i) => i.href));
    for (const item of ADMIN_NAV) {
      expect(within(rail).getByRole("link", { name: new RegExp(item.label) }).getAttribute("href")).toBe(
        item.href,
      );
    }
  });

  it("lights the entry that owns the current path, sub-routes included", () => {
    nav.pathname = "/admin/config/general";
    render(<AdminConsole />);
    const rail = screen.getByRole("navigation", { name: "Admin console" });
    expect(within(rail).getByRole("link", { name: "Instance" })).toHaveProperty(
      "ariaCurrent",
      "page",
    );
    // Overview is `exact`, so the index link never shadows a sub-route.
    expect(within(rail).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      null,
    );
  });

  it("self-hides for a non-admin viewer", () => {
    session.user = { ...admin, role: "moderator" };
    const { container } = render(<AdminConsole />);
    expect(container.innerHTML).toBe("");
  });
});

// The Select's option order: the registry regrouped for a native <select> —
// console sections first, then More, then the link-outs that exit the console.
const GROUPED = [
  ...ADMIN_NAV_PRIMARY.filter((i) => !i.external),
  ...ADMIN_NAV_MORE,
  ...ADMIN_NAV.filter((i) => i.external),
];

describe("AdminTabs select", () => {
  it("offers every registry entry — the moderation destinations included", () => {
    render(<AdminTabs />);
    const select = screen.getByRole("combobox", { name: "Admin section" });
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.getAttribute("value"))).toEqual(GROUPED.map((i) => i.href));
    expect(options.map((o) => o.textContent)).toEqual(GROUPED.map((i) => i.label));
    expect(new Set(GROUPED.map((i) => i.href))).toEqual(new Set(ADMIN_NAV.map((i) => i.href)));
    // The regression this registry closes: below `lg` the rail is hidden, so a
    // Select without these two left a phone-bound admin no route to moderation.
    expect(options.map((o) => o.getAttribute("value"))).toEqual(
      expect.arrayContaining(["/moderation", "/moderation/videos"]),
    );
  });

  it("keeps the registry's grouping — and marks what exits the console", () => {
    // A flat 14-option list buried the design's primary/More split, and hid
    // that the two moderation entries leave /admin for a different surface.
    render(<AdminTabs />);
    const select = screen.getByRole("combobox", { name: "Admin section" });
    const groups = within(select).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("label"))).toEqual(["Console", "More", "Moderation"]);
    expect(
      within(groups[0]).getAllByRole("option").map((o) => o.getAttribute("value")),
    ).toEqual(ADMIN_NAV_PRIMARY.filter((i) => !i.external).map((i) => i.href));
    expect(
      within(groups[1]).getAllByRole("option").map((o) => o.getAttribute("value")),
    ).toEqual(ADMIN_NAV_MORE.map((i) => i.href));
    expect(
      within(groups[2]).getAllByRole("option").map((o) => o.getAttribute("value")),
    ).toEqual(ADMIN_NAV.filter((i) => i.external).map((i) => i.href));
  });

  it("resolves a sub-route to its parent section", () => {
    nav.pathname = "/admin/config/general";
    render(<AdminTabs />);
    expect(screen.getByRole("combobox", { name: "Admin section" })).toHaveProperty(
      "value",
      "/admin/config",
    );
  });

  it("self-hides for a non-admin viewer", () => {
    session.user = { ...admin, role: "user" };
    const { container } = render(<AdminTabs />);
    expect(container.innerHTML).toBe("");
  });
});

describe("AdminOverview manage list", () => {
  it("renders every registry entry that does not opt out, with its description", () => {
    render(<AdminOverview />);
    const cards = screen.getByRole("region", { name: "Admin sections" });
    const links = within(cards).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      ADMIN_NAV_OVERVIEW.map((i) => i.href),
    );
    for (const item of ADMIN_NAV_OVERVIEW) {
      expect(within(cards).getByText(item.label, { selector: "span" })).toBeTruthy();
      expect(within(cards).getByText(item.description)).toBeTruthy();
    }
  });

  it("omits only the entries that say so, and says why in the registry", () => {
    render(<AdminOverview />);
    const cards = screen.getByRole("region", { name: "Admin sections" });
    const hrefs = within(cards)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    // The page itself, and the two moderation surfaces the open-reports callout
    // below already leads to with a live count.
    expect(ADMIN_NAV.filter((i) => i.omitFromOverview).map((i) => i.href)).toEqual([
      "/admin",
      "/moderation",
      "/moderation/videos",
    ]);
    for (const href of ["/admin", "/moderation", "/moderation/videos"]) {
      expect(hrefs).not.toContain(href);
    }
  });

  it("gates a non-admin viewer instead of listing the sections", () => {
    session.user = { ...admin, role: "moderator" };
    render(<AdminOverview />);
    expect(screen.getByText("Administrators only")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Admin sections" })).toBe(null);
  });
});
