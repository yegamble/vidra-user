"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export type PillTabItem = {
  /** Route this pill navigates to, and the value the active test compares. */
  href: string;
  label: string;
};

export type PillTabsProps = {
  tabs: readonly PillTabItem[];
  /** Accessible name for the nav landmark, e.g. "Mute types". */
  label: string;
  /**
   * Layout classes for the `<nav>` — the callers' margins differ, and `cn` is a
   * plain join, so a default `mb-6` here could not be overridden to `mb-4`.
   */
  className?: string;
};

// The active pill is a filled accent capsule; the rest are outlined and tint on
// hover. Static strings so Tailwind sees both.
const ACTIVE =
  "focus-ring rounded-full border border-accent bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg";
const INACTIVE =
  "focus-ring rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-muted";

/**
 * PillTabs — the route-backed sub-navigation pill bar (mutes: Accounts /
 * Instances; blocked videos: Local / Remote). The link-list counterpart to
 * `Tabs`, which is the state-driven in-page tab set and deliberately does not
 * serve route sub-navs.
 *
 * Active is decided by exact pathname equality, matching what both call sites
 * did: these bars address sibling leaf routes, so a prefix match would light up
 * two pills at once on a nested path.
 *
 * Role gating is the caller's job — the gated bar self-hides so it never
 * appears above a "Moderators only" prompt, and that decision belongs with the
 * surface, not with the pills.
 */
export function PillTabs({ tabs, label, className }: PillTabsProps) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-wrap gap-2", className)} aria-label={label}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={active ? ACTIVE : INACTIVE}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
