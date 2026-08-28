// Admin navigation registry — every admin destination declared exactly once.
//
// Three surfaces render admin navigation, and each one used to carry its own
// hand-maintained list:
//
//   * components/AdminConsole.tsx  — the desktop rail (`lg:`): a small PRIMARY
//     group with icons, then a quiet "More" group of the remaining surfaces.
//   * components/AdminTabs.tsx     — the `<lg` section `<Select>`.
//   * components/AdminOverview.tsx — the /admin index's "Manage" list.
//
// They drifted the way three parallel lists always drift: the mobile Select
// listed no moderation destination at all (a phone-bound admin could not reach
// the report queue), the Overview omitted Infrastructure, Playback health,
// Import and Followers, and /admin/config went by three different names. This
// module ends that class of bug — a destination added here shows up on every
// surface, and a rename happens once.
//
// The in-repo precedent is CONFIG_PAGES in lib/admin-config-ia.ts: the config
// sub-rail (components/AdminConfigNav.tsx) has been data-driven from it since
// the config IA split and has never drifted.
//
// GROUPING IS PRESENTATION, NOT PERMISSION. Every entry here is admin-only —
// the surfaces themselves self-hide for non-admins (and each route re-gates).
// The "primary" group stays SMALL on purpose: it is the design's five console
// destinations, deliberate progressive disclosure. A new admin surface belongs
// in "more" unless the design promotes it.
//
// No "use client" here: this is data plus pure helpers.

import type { ReactElement } from "react";

import {
  GridIcon,
  type IconProps,
  ServerIcon,
  ShieldIcon,
  UsersIcon,
  VideoIcon,
} from "@/components/icons";

/** Which group of the desktop rail an entry renders in. */
export type AdminNavGroup = "primary" | "more";

export type AdminNavItem = {
  href: string;
  /**
   * The destination's ONE name, everywhere. The desktop rail's labels are the
   * canonical ones (the e2e suites click them by name, and the design names
   * the console destinations); the mobile Select and the Overview list now
   * reuse them instead of inventing synonyms.
   */
  label: string;
  /**
   * One line of "what lives here", rendered under the label in the Overview's
   * Manage list. Kept on every entry so an entry promoted onto that list later
   * arrives with its copy already written.
   */
  description: string;
  group: AdminNavGroup;
  /**
   * The rail icon. Only the PRIMARY group renders one — the "More" group is
   * deliberately label-only (the design's quiet secondary group), so those
   * entries carry no icon rather than an invented one. Icons come from
   * components/icons only (`npm run lint:icons` is the gate).
   */
  Icon?: (props: IconProps) => ReactElement;
  /** Only lit when the path matches exactly (the /admin Overview index). */
  exact?: boolean;
  /** Carries the live open-reports count badge (the design's red Queues badge). */
  badge?: boolean;
  /**
   * Lives outside /admin: the moderation surfaces keep their own moderator nav,
   * so the admin console never lights up for them (it renders on /admin/* only).
   * They are still listed — reaching moderation from admin is the whole point.
   */
  external?: boolean;
  /**
   * Deliberately absent from the Overview's "Manage" list. An explicit opt-out
   * with a stated reason, so a silent omission can never masquerade as
   * curation again — see the two entries that set it.
   */
  omitFromOverview?: true;
};

/**
 * Every admin destination, in canonical order: the PRIMARY group first (rail
 * order), then "More". The rail reads its two groups from here, the mobile
 * Select renders the whole list in this order, and the Overview renders it
 * minus the explicit opt-outs.
 */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: "Overview",
    description: "Instance health, job queues, and the recent audit trail.",
    group: "primary",
    Icon: GridIcon,
    exact: true,
    // The Manage list lives ON the Overview; a card linking to the page you are
    // already reading is noise.
    omitFromOverview: true,
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Search accounts and manage their role and active status.",
    group: "primary",
    Icon: UsersIcon,
  },
  {
    href: "/moderation",
    label: "Queues",
    description: "Review and resolve abuse reports filed by viewers.",
    group: "primary",
    Icon: ShieldIcon,
    badge: true,
    external: true,
    // The Overview already leads to the report queue through its open-reports
    // callout ("N open reports · Moderation queue"), which carries the live
    // count a static card could not. A second link would duplicate it.
    omitFromOverview: true,
  },
  {
    href: "/moderation/videos",
    label: "Content",
    description: "The local and federated video inventory, with moderation actions.",
    group: "primary",
    Icon: VideoIcon,
    external: true,
    // Sits under the same moderation callout as Queues above; the Manage list
    // stays the admin sections.
    omitFromOverview: true,
  },
  {
    href: "/admin/config",
    label: "Instance",
    description: "Instance identity, registration, feature toggles, and moderation gates.",
    group: "primary",
    Icon: ServerIcon,
  },
  {
    href: "/admin/registration-requests",
    label: "Registration",
    description: "Review pending signups and approve or reject them.",
    group: "more",
  },
  {
    href: "/admin/federation/follower-requests",
    label: "Followers",
    description: "Approve or reject remote accounts asking to follow local channels.",
    group: "more",
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    description: "Background-work queue depth, stuck workers, and recent failures.",
    group: "more",
  },
  {
    href: "/admin/import-peertube",
    label: "Import",
    description: "Migrate an existing PeerTube instance into this one.",
    group: "more",
  },
  {
    href: "/admin/media",
    label: "Media storage",
    description: "Garbage-collect stored media objects with no database reference.",
    group: "more",
  },
  {
    href: "/admin/audit-log",
    label: "Audit log",
    description: "The security audit trail of admin and auth actions.",
    group: "more",
  },
  {
    href: "/admin/system",
    label: "System",
    description: "Build info, environment, uptime, and dependency health.",
    group: "more",
  },
  {
    href: "/admin/infrastructure",
    label: "Infrastructure",
    description: "How this instance is deployed: server limits, storage, networking, and backups.",
    group: "more",
  },
  {
    href: "/admin/playback-health",
    label: "Playback health",
    description: "Time to first frame and rebuffering, grouped by the delivery source.",
    group: "more",
  },
] as const;

/** The console index — where an unresolvable path falls back to. */
export const ADMIN_NAV_HOME = "/admin";

/** The rail's icon-bearing top group (deliberately small). */
export const ADMIN_NAV_PRIMARY: readonly AdminNavItem[] = ADMIN_NAV.filter(
  (item) => item.group === "primary",
);

/** The rail's quiet, label-only "More" group. */
export const ADMIN_NAV_MORE: readonly AdminNavItem[] = ADMIN_NAV.filter(
  (item) => item.group === "more",
);

/** The Overview's "Manage" list: everything except the explicit opt-outs. */
export const ADMIN_NAV_OVERVIEW: readonly AdminNavItem[] = ADMIN_NAV.filter(
  (item) => !item.omitFromOverview,
);

/**
 * Whether an entry owns the current path. Sub-routes resolve to their parent
 * (Config is a layout route, e.g. /admin/config/general); an `exact` entry
 * (the Overview index) never shadows the others.
 */
export function isAdminNavItemActive(item: AdminNavItem, pathname: string | null | undefined): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname?.startsWith(`${item.href}/`) === true;
}

/**
 * The href of the entry that owns `pathname`, for the mobile Select's value.
 * Falls back to the console index so the control is never valueless (a
 * `<select>` with no matching option renders its first option instead).
 */
export function adminNavCurrentHref(pathname: string | null | undefined): string {
  return ADMIN_NAV.find((item) => isAdminNavItemActive(item, pathname))?.href ?? ADMIN_NAV_HOME;
}
