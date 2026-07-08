import type { ReactElement } from "react";

import {
  ClockIcon,
  type IconProps,
  LibraryIcon,
  MessageCircleIcon,
  ShieldIcon,
  TrendingUpIcon,
  TvIcon,
  UsersIcon,
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

/** Admin entry (admins only). Any /admin/* route counts as active. */
export const ADMIN_LINK: NavLinkDef = {
  href: "/admin/users",
  label: "Admin",
  Icon: UsersIcon,
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
