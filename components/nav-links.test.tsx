import { describe, expect, it } from "vitest";

import { GridIcon, UsersIcon } from "@/components/icons";
import {
  ADMIN_LINK,
  MODERATION_LINK,
  NAV_LINKS,
  isActiveNavLink,
  primaryNavLinks,
} from "./nav-links";

// An operator who turns messaging off gates every /conversations route with a
// 403, so the Messages destination must not be offered. The counter-cases
// matter more than the gate: an instance that never touched the switch, and a
// core too old to disclose it, must keep the exact nav they have today.
describe("primaryNavLinks", () => {
  it("drops the Messages destination when messaging is unavailable", () => {
    const hrefs = primaryNavLinks(false).map((l) => l.href);
    expect(hrefs).not.toContain("/messages");
  });

  it("leaves every other destination in place, in order, when Messages is dropped", () => {
    expect(primaryNavLinks(false).map((l) => l.href)).toEqual(
      NAV_LINKS.filter((l) => l.href !== "/messages").map((l) => l.href),
    );
  });

  it("is the untouched list when messaging is available", () => {
    expect(primaryNavLinks(true)).toEqual([...NAV_LINKS]);
    expect(primaryNavLinks(true).map((l) => l.href)).toContain("/messages");
  });
});

// The global chrome's role-gated entries must agree with the admin console
// registry (lib/admin-nav.ts): the console home is /admin (the Overview
// dashboard), and its glyph there is the grid icon. When ADMIN_LINK pointed at
// /admin/users with UsersIcon, the sidebar skipped the console home entirely
// and wore the same glyph as the console's own "Users" destination.
describe("ADMIN_LINK", () => {
  it("points at the console home, not a subpage", () => {
    expect(ADMIN_LINK.href).toBe("/admin");
  });

  it("wears the console Overview's grid glyph, not the Users one", () => {
    expect(ADMIN_LINK.Icon).toBe(GridIcon);
    expect(ADMIN_LINK.Icon).not.toBe(UsersIcon);
  });

  it("stays lit across every /admin subroute without a special case", () => {
    expect(isActiveNavLink(ADMIN_LINK, "/admin")).toBe(true);
    expect(isActiveNavLink(ADMIN_LINK, "/admin/users")).toBe(true);
    expect(isActiveNavLink(ADMIN_LINK, "/admin/config/general")).toBe(true);
    expect(isActiveNavLink(ADMIN_LINK, "/administrator")).toBe(false);
    expect(isActiveNavLink(ADMIN_LINK, "/moderation")).toBe(false);
  });
});

describe("isActiveNavLink", () => {
  it("matches Home only exactly, other entries on themselves and subroutes", () => {
    const home = NAV_LINKS[0];
    expect(home.href).toBe("/");
    expect(isActiveNavLink(home, "/")).toBe(true);
    expect(isActiveNavLink(home, "/library")).toBe(false);
    expect(isActiveNavLink(MODERATION_LINK, "/moderation")).toBe(true);
    expect(isActiveNavLink(MODERATION_LINK, "/moderation/videos")).toBe(true);
    expect(isActiveNavLink(MODERATION_LINK, "/admin")).toBe(false);
    expect(isActiveNavLink(MODERATION_LINK, null)).toBe(false);
  });
});
