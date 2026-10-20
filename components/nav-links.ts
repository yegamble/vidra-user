import type { ReactElement } from "react";

import type { PlainMessageKey } from "@/lib/i18n";

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
  /** Catalog key of the visible label; render with `t(labelKey)`. */
  labelKey: PlainMessageKey;
  Icon: (props: IconProps) => ReactElement;
}

export const NAV_LINKS: readonly NavLinkDef[] = [
  { href: "/", labelKey: "nav.home", Icon: HomeIcon },
  { href: "/trending", labelKey: "nav.trending", Icon: TrendingUpIcon },
  { href: "/subscriptions", labelKey: "nav.subscriptions", Icon: TvIcon },
  { href: "/library", labelKey: "nav.library", Icon: LibraryIcon },
  // Playlists is intentionally NOT a primary sidebar destination: the desktop
  // template (backport W0.2) lists exactly Home/Trending/Subscriptions/Library/
  // History/Messages/Studio. Playlists is reached from the Library page (its
  // route lives on and the BottomTabBar already groups /playlists under Library).
  { href: "/history", labelKey: "nav.history", Icon: ClockIcon },
  { href: "/messages", labelKey: "nav.messages", Icon: MessageCircleIcon },
  { href: "/studio", labelKey: "nav.studio", Icon: VideoIcon },
] as const;

/** The Messages destination's href — the one primary entry an operator can turn off. */
const MESSAGES_HREF = "/messages";

/**
 * The primary destinations for this instance. When the operator has turned
 * direct messaging off (GET /instance `features.messaging` === false) every
 * /conversations route answers 403, so the Messages entry is not offered —
 * a nav link to a surface that can only fail is worse than no link.
 */
export function primaryNavLinks(messagingAvailable: boolean): NavLinkDef[] {
  return NAV_LINKS.filter((item) => messagingAvailable || item.href !== MESSAGES_HREF);
}

/** Moderation entry (moderators + admins only). */
export const MODERATION_LINK: NavLinkDef = {
  href: "/moderation",
  labelKey: "nav.moderation",
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
  labelKey: "nav.admin",
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
