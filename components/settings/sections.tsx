import type { ReactElement } from "react";

import {
  BellIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  HeartIcon,
  type IconProps,
  LinkIcon,
  LockIcon,
  PlayIcon,
  SearchIcon,
  SlashCircleIcon,
  SmartphoneIcon,
  UserIcon,
} from "@/components/icons";
import type { PlainMessageKey } from "@/lib/i18n";

// The settings section catalog, shared by the two Group-C surfaces that
// must stay in lock-step: the desktop SettingsRail (lg split-view) and the
// mobile grouped-rows drill-in inside SettingsView. Keeping one source means the
// icon, the route, and the sr-only "Manage …" name (pinned by e2e) can never
// drift between the two. Rows lead with a PLAIN muted stroke glyph — the app's
// nav idiom everywhere else (Sidebar, StudioNav, admin rail) — not the colored
// System-Settings tile this catalog used to carry a hue for.
export type SettingsSection = {
  /** Route this row navigates to. */
  href: string;
  /** sr-only action name kept stable for e2e (`getByRole("link", { name })`). */
  action: PlainMessageKey;
  /** Full row title (mobile grouped rows). */
  title: PlainMessageKey;
  /** Short label for the compact desktop rail. */
  short: PlainMessageKey;
  /** Muted sub-line under the title (mobile rows). */
  desc: PlainMessageKey;
  Icon: (props: IconProps) => ReactElement;
  /** Extra route prefixes that also light this rail item (e.g. sub-tabs). */
  activePaths?: readonly string[];
};

export type SettingsSectionGroup = { label: PlainMessageKey; items: readonly SettingsSection[] };

// The profile / account identity destination — the settings index itself.
export const SETTINGS_PROFILE = {
  href: "/settings",
  short: "settings.nav.profile" as const satisfies PlainMessageKey,
  Icon: UserIcon,
};

export const SETTINGS_GROUPS: readonly SettingsSectionGroup[] = [
  {
    label: "settings.group.account",
    items: [
      {
        href: "/settings/playback",
        action: "settings.nav.playback.action",
        title: "settings.nav.playback.title",
        short: "settings.nav.playback.short",
        desc: "settings.nav.playback.desc",
        Icon: PlayIcon,
      },
      {
        href: "/settings/security",
        action: "settings.nav.security.action",
        title: "settings.nav.security.title",
        short: "settings.nav.security.short",
        desc: "settings.nav.security.desc",
        Icon: LockIcon,
      },
      {
        href: "/settings/connections",
        action: "settings.nav.connections.action",
        title: "settings.nav.connections.title",
        short: "settings.nav.connections.short",
        desc: "settings.nav.connections.desc",
        Icon: LinkIcon,
      },
      {
        href: "/settings/devices",
        action: "settings.nav.devices.action",
        title: "settings.nav.devices.title",
        short: "settings.nav.devices.short",
        desc: "settings.nav.devices.desc",
        Icon: SmartphoneIcon,
      },
      {
        href: "/settings/notifications",
        action: "settings.nav.notifications.action",
        title: "settings.nav.notifications.title",
        short: "settings.nav.notifications.short",
        desc: "settings.nav.notifications.desc",
        Icon: BellIcon,
      },
      {
        href: "/settings/donations",
        action: "settings.nav.donations.action",
        title: "settings.nav.donations.title",
        short: "settings.nav.donations.short",
        desc: "settings.nav.donations.desc",
        Icon: HeartIcon,
      },
    ],
  },
  {
    label: "settings.group.privacy",
    items: [
      {
        href: "/settings/search",
        action: "settings.nav.search.action",
        title: "settings.nav.search.title",
        short: "settings.nav.search.short",
        desc: "settings.nav.search.desc",
        Icon: SearchIcon,
      },
      {
        href: "/settings/content",
        action: "settings.nav.content.action",
        title: "settings.nav.content.title",
        short: "settings.nav.content.short",
        desc: "settings.nav.content.desc",
        Icon: EyeIcon,
      },
      {
        href: "/settings/mutes",
        action: "settings.nav.mutes.action",
        title: "settings.nav.mutes.title",
        short: "settings.nav.mutes.short",
        desc: "settings.nav.mutes.desc",
        Icon: EyeOffIcon,
        activePaths: ["/settings/mutes/instances"],
      },
      {
        href: "/settings/blocks",
        action: "settings.nav.blocks.action",
        title: "settings.nav.blocks.title",
        short: "settings.nav.blocks.short",
        desc: "settings.nav.blocks.desc",
        Icon: SlashCircleIcon,
        // The remote-account block list is a SIBLING page rather than a second
        // list here (A29-F7): the identity is a federated actor URL, added by
        // pasting a handle. It rides this row so a viewer looking for "blocked"
        // finds both, the way the mutes row already carries its instances page.
        activePaths: ["/settings/blocks/remote"],
      },
      {
        href: "/settings/reports",
        action: "settings.nav.reports.action",
        title: "settings.nav.reports.title",
        short: "settings.nav.reports.short",
        desc: "settings.nav.reports.desc",
        Icon: FlagIcon,
      },
    ],
  },
];

/** True when `pathname` should light the rail row for `section`. */
export function isSectionActive(pathname: string | null, section: SettingsSection): boolean {
  if (!pathname) return false;
  if (pathname === section.href || pathname.startsWith(`${section.href}/`)) return true;
  return (
    section.activePaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false
  );
}
