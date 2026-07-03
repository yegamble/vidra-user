// The primary navigation destinations, shared by the desktop sidebar and the
// small-screen collapsed menu so the two can never drift apart. Icons are
// minified Feather-style single-path strings on a 24x24 stroke grid (dots are
// zero-length round-cap segments), rendered inline by each consumer.

export interface NavLinkDef {
  href: string;
  label: string;
  /** Minified inline-SVG path (24x24, stroked). */
  iconPath: string;
}

export const NAV_LINKS: readonly NavLinkDef[] = [
  {
    href: "/",
    label: "Home",
    iconPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  },
  {
    href: "/trending",
    label: "Trending",
    iconPath: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  },
  {
    href: "/subscriptions",
    label: "Subscriptions",
    iconPath: "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19h.01",
  },
  {
    href: "/library",
    label: "Library",
    iconPath: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  },
  {
    href: "/playlists",
    label: "Playlists",
    iconPath: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  },
  {
    href: "/history",
    label: "History",
    iconPath: "M12 8v4l3 3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  },
  {
    href: "/messages",
    label: "Messages",
    iconPath:
      "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  },
  {
    href: "/studio",
    label: "Studio",
    iconPath:
      "M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z",
  },
] as const;

/** Moderation entry (moderators + admins only). */
export const MODERATION_LINK: NavLinkDef = {
  href: "/moderation",
  label: "Moderation",
  iconPath: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

/** Admin entry (admins only). Any /admin/* route counts as active. */
export const ADMIN_LINK: NavLinkDef = {
  href: "/admin/users",
  label: "Admin",
  iconPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 11l-2 2-1-1",
};

/**
 * Whether a nav entry is the active route. "/" matches only exactly; other
 * entries match themselves and their subroutes ("/admin/users" owns "/admin/*",
 * so the Admin entry stays lit across the admin tabs).
 */
export function isActiveNavLink(item: NavLinkDef, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.href === "/") return pathname === "/";
  const prefix = item.href === ADMIN_LINK.href ? "/admin" : item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
