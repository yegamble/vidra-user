"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import type { IconProps } from "@/components/icons";
import { IconTile, type TileColor } from "@/components/ui";
import { cn } from "@/lib/cn";

import {
  SETTINGS_GROUPS,
  SETTINGS_PROFILE,
  isSectionActive,
} from "./sections";

// SettingsRail is the desktop (≥ lg) section sidebar of the System-Settings
// split view: a leading IconTile per destination, a short label, and a
// tint-pill active row (the app's shared active-nav recipe). Below lg it
// collapses and the grouped-rows drill-in inside SettingsView takes over.
// Renders only for a signed-in user (the section pages themselves gate anon
// access) — mirrors the mobile rows, which live inside the signed-in branch of
// SettingsView.
export function SettingsRail() {
  const pathname = usePathname();
  const { user } = useSession();
  if (!user) return null;

  return (
    <nav
      aria-label="Settings"
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[240px] shrink-0 flex-col self-start overflow-y-auto px-3 py-8 lg:flex"
    >
      <h2 className="mb-3 px-2 text-title2">Settings</h2>
      <ul className="flex flex-col gap-0.5">
        <li>
          <RailLink
            href={SETTINGS_PROFILE.href}
            color={SETTINGS_PROFILE.color}
            Icon={SETTINGS_PROFILE.Icon}
            label={SETTINGS_PROFILE.short}
            active={pathname === SETTINGS_PROFILE.href}
          />
        </li>
      </ul>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="mt-5">
          <h3 className="px-2 pb-1.5 text-caption font-bold uppercase tracking-[0.06em] text-fg-muted">
            {group.label}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <RailLink
                  href={item.href}
                  color={item.color}
                  Icon={item.Icon}
                  label={item.short}
                  action={item.action}
                  active={isSectionActive(pathname, item)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function RailLink({
  href,
  color,
  Icon,
  label,
  action,
  active,
}: {
  href: string;
  color: TileColor;
  Icon: (props: IconProps) => ReactElement;
  label: string;
  /** sr-only "Manage …" name so the rail carries the pinned e2e link name. */
  action?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring flex items-center gap-3 rounded-[10px] px-2 py-1.5 text-[15px] transition-colors",
        active
          ? "bg-accent/12 font-semibold text-accent-text"
          : "font-medium text-fg hover:bg-surface-muted",
      )}
    >
      <IconTile color={color}>
        <Icon size={16} />
      </IconTile>
      <span className="truncate">{label}</span>
      {action ? <span className="sr-only">{action}</span> : null}
    </Link>
  );
}
