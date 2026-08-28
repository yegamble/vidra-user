import { describe, expect, it } from "vitest";

import { GridIcon, UsersIcon } from "@/components/icons";
import { ADMIN_LINK, MODERATION_LINK, NAV_LINKS, isActiveNavLink } from "./nav-links";

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
