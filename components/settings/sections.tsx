import type { ReactElement } from "react";

import {
  BellIcon,
  EyeOffIcon,
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
import type { TileColor } from "@/components/ui";

// The System-Settings section catalog, shared by the two Group-C surfaces that
// must stay in lock-step: the desktop SettingsRail (lg split-view) and the
// mobile grouped-rows drill-in inside SettingsView. Keeping one source means the
// icon-tile hue, the route, and the sr-only "Manage …" name (pinned by e2e) can
// never drift between the two.
export type SettingsSection = {
  /** Route this row navigates to. */
  href: string;
  /** sr-only action name kept stable for e2e (`getByRole("link", { name })`). */
  action: string;
  /** Full row title (mobile grouped rows). */
  title: string;
  /** Short label for the compact desktop rail. */
  short: string;
  /** Muted sub-line under the title (mobile rows). */
  desc: string;
  /** Apple system-color tile hue — one per destination (Mutes = indigo, Blocked = red). */
  color: TileColor;
  Icon: (props: IconProps) => ReactElement;
  /** Extra route prefixes that also light this rail item (e.g. sub-tabs). */
  activePaths?: readonly string[];
};

export type SettingsSectionGroup = { label: string; items: readonly SettingsSection[] };

// The profile / account identity destination — the settings index itself.
export const SETTINGS_PROFILE = {
  href: "/settings",
  short: "Profile",
  color: "blue" as TileColor,
  Icon: UserIcon,
};

export const SETTINGS_GROUPS: readonly SettingsSectionGroup[] = [
  {
    label: "Account",
    items: [
      {
        href: "/settings/playback",
        action: "Manage playback settings",
        title: "Playback",
        short: "Playback",
        desc: "Autoplay, default speed and quality, captions and theater defaults.",
        color: "purple",
        Icon: PlayIcon,
      },
      {
        href: "/settings/security",
        action: "Manage security settings",
        title: "Security",
        short: "Security",
        desc: "Two-factor authentication and recovery codes.",
        color: "gray",
        Icon: LockIcon,
      },
      {
        href: "/settings/connections",
        action: "Manage connected accounts",
        title: "Connected accounts",
        short: "Connections",
        desc: "Connect Bluesky to cross-post your new public videos (ATProto).",
        color: "green",
        Icon: LinkIcon,
      },
      {
        href: "/settings/devices",
        action: "Manage encrypted-messaging devices",
        title: "Encrypted-messaging devices",
        short: "Devices",
        desc: "Devices that can read your encrypted messages, and their safety numbers.",
        color: "teal",
        Icon: SmartphoneIcon,
      },
      {
        href: "/settings/notifications",
        action: "Manage notification preferences",
        title: "Notifications",
        short: "Notifications",
        desc: "Choose which notifications you receive.",
        color: "red",
        Icon: BellIcon,
      },
      {
        href: "/settings/donations",
        action: "Manage donation addresses",
        title: "Donation addresses",
        short: "Donations",
        desc: "Public crypto addresses shown on your profile and channels (display only).",
        color: "pink",
        Icon: HeartIcon,
      },
    ],
  },
  {
    label: "Privacy & safety",
    items: [
      {
        href: "/settings/search",
        action: "Manage search and recommendations",
        title: "Search & recommendations",
        short: "Search",
        desc: "Personalization, and your search history.",
        color: "orange",
        Icon: SearchIcon,
      },
      {
        href: "/settings/mutes",
        action: "Manage muted accounts",
        title: "Mutes",
        short: "Mutes",
        desc: "Accounts and federated instances whose content is hidden from you.",
        color: "indigo",
        Icon: EyeOffIcon,
        activePaths: ["/settings/mutes/instances"],
      },
      {
        href: "/settings/blocks",
        action: "Manage blocked accounts",
        title: "Blocked accounts",
        short: "Blocked",
        desc: "Accounts you have blocked. Neither of you can direct-message the other.",
        // Blocked reads as a harder boundary than Mute, so it wears the red tile
        // (Mutes keeps indigo) — one hue per destination (design-system.md).
        color: "red",
        Icon: SlashCircleIcon,
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
