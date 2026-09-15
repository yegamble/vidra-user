"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import type { IconProps } from "@/components/icons";
import { cn } from "@/lib/cn";

import {
  SETTINGS_GROUPS,
  SETTINGS_PROFILE,
  isSectionActive,
} from "./sections";

// SettingsRail is the desktop (≥ lg) section sidebar of the settings split
// view: a plain leading icon per destination, a short label, and a tint-pill
// active row — the same nav recipe as the app Sidebar, StudioNav, the admin
// rail and ModerationSectionNav (18px stroke glyph, muted at rest, accent when
// active). It used to lead each row with a colored IconTile, which nothing
// else in the app does; eleven saturated squares read as a foreign surface.
// Below lg it collapses and the grouped-rows drill-in in SettingsView takes over.
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
  Icon,
  label,
  action,
  active,
}: {
  href: string;
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
        // `min-h-11` is the Sidebar's own 44px row floor — the 28px tile used to
        // set the row height, so without it an 18px glyph would shrink the target.
        "focus-ring flex min-h-11 items-center gap-3 rounded-[10px] px-2 py-1.5 text-[15px] transition-colors",
        active
          ? "bg-accent/12 font-semibold text-accent-text"
          : "font-medium text-fg hover:bg-surface-muted",
      )}
    >
      {/* Sidebar-identical glyph: 18px at 1.9 stroke, muted at rest, taking the
          row's accent when active. The colour is stated on the icon rather than
          inherited so the rest of the row can keep its own weight/colour. */}
      <Icon
        size={18}
        strokeWidth={1.9}
        className={cn("shrink-0", active ? "text-accent-text" : "text-fg-muted")}
      />
      <span className="truncate">{label}</span>
      {action ? <span className="sr-only">{action}</span> : null}
    </Link>
  );
}
