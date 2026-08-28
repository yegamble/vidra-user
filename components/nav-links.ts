import type { ReactElement } from "react";

import {
  ClockIcon,
  GridIcon,
  type IconProps,
  LibraryIcon,
  MessageCircleIcon,
  ShieldIcon,
  TrendingUpIcon,
  TvIcon,
  VideoIcon,
  HomeIcon,
} from "@/components/icons";

// The primary navigation destinations, shared by the desktop sidebar (its only
// consumer today). Each entry carries its icon as a component from the shared
// typed icon set (components/icons) — the single source of iconography, whose
// paths are vendored verbatim from the design — so the sidebar renders the exact
// design glyphs (home / trending-up / tv / library / clock / message-circle /
// video) rather than an ad-hoc inline path.

export interface NavLinkDef {
  href: string;
  label: string;
  Icon: (props: IconProps) => ReactElement;
}

export const NAV_LINKS: readonly NavLinkDef[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/trending", label: "Trending", Icon: TrendingUpIcon },
  { href: "/subscriptions", label: "Subscriptions", Icon: TvIcon },
  { href: "/library", label: "Library", Icon: LibraryIcon },
  // Playlists is intentionally NOT a primary sidebar destination: the desktop
  // template (backport W0.2) lists exactly Home/Trending/Subscriptions/Library/
  // History/Messages/Studio. Playlists is reached from the Library page (its
  // route lives on and the BottomTabBar already groups /playlists under Library).
  { href: "/history", label: "History", Icon: ClockIcon },
  { href: "/messages", label: "Messages", Icon: MessageCircleIcon },
  { href: "/studio", label: "Studio", Icon: VideoIcon },
] as const;

/** Moderation entry (moderators + admins only). */
export const MODERATION_LINK: NavLinkDef = {
  href: "/moderation",
  label: "Moderation",
  Icon: ShieldIcon,
};

/**
 * Admin entry (admins only). Points at the console home — /admin, the Overview
 * dashboard — matching ADMIN_NAV_HOME in lib/admin-nav.ts, and wears the same
 * grid glyph the console gives Overview there (UsersIcon would collide with the
 * console's own "Users" destination). Prefix matching keeps it lit on /admin/*.
 */
export const ADMIN_LINK: NavLinkDef = {
  href: "/admin",
  label: "Admin",
  Icon: GridIcon,
};

/**
 * Whether a nav entry is the active route. "/" matches only exactly; other
 * entries match themselves and their subroutes (so the Admin entry stays lit
 * across the whole console).
 */
export function isActiveNavLink(item: NavLinkDef, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
