"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import {
  ADMIN_NAV_MORE,
  ADMIN_NAV_PRIMARY,
  type AdminNavItem,
  isAdminNavItemActive,
} from "@/lib/admin-nav";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

// Both groups come from the one admin-nav registry (lib/admin-nav.ts): the
// design's five primary console destinations (Overview / Users / Instance are
// admin routes owned by this console shell; Queues / Content link out to the
// moderation surfaces, which keep their own moderator nav — so they never light
// up while the console is showing, it renders on /admin/* only), then the quiet
// "More" group of the remaining admin sub-surfaces the design's 5-item nav does
// not enumerate, so no admin route is stranded (there is no admin bottom-tab bar
// and the AdminTabs Select is hidden at this width).

// The open-reports count is capped for display; the exact figure lives on the
// Overview open-reports callout (and the Moderation queue itself).
const BADGE_CAP = 99;
const REPORTS_PAGE = 100;

// AdminConsole is the design's desktop admin sidebar — a 230px rail with the
// "Vidra ADMIN" wordmark, the five primary console destinations (a live red
// count badge on Queues), a secondary group for the remaining admin surfaces,
// and the signed-in admin's identity card pinned to the bottom. Desktop-only
// (`lg:`); below that the horizontal AdminTabs remain the admin section nav.
// Renders for admins only (a non-admin viewer hits the page's "Administrators
// only" gate and never sees the console).
export function AdminConsole() {
  const pathname = usePathname();
  const { user } = useSession();
  const [openReports, setOpenReports] = useState<number | null>(null);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const controller = new AbortController();
    api
      .getReports({ status: "open", limit: REPORTS_PAGE }, controller.signal)
      // Best-effort: the badge is a convenience, so a failed read simply omits it
      // (swallowed — never a thrown rejection or a blank console).
      .then((res) => setOpenReports(res.reports.length))
      .catch(() => {});
    return () => controller.abort();
  }, [user?.role]);

  if (user?.role !== "admin") return null;

  const badgeText =
    openReports && openReports > 0
      ? openReports > BADGE_CAP
        ? `${BADGE_CAP}+`
        : String(openReports)
      : null;

  return (
    <nav
      aria-label="Admin console"
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[230px] shrink-0 flex-col self-start overflow-y-auto border-r border-border-subtle px-2.5 py-4 lg:flex"
    >
      {/* Section label only — the global Header directly above already carries the
          "Vidra" wordmark (and the back-to-app home link), so repeating the brand
          here read as a duplicate. The rail names the area, like a Settings sidebar. */}
      <h2 className="mx-0.5 mb-3 px-2.5 py-1 text-[15px] font-bold tracking-[-0.02em] text-fg">
        Admin
      </h2>

      <ul className="flex flex-col gap-0.5">
        {ADMIN_NAV_PRIMARY.map((item) => (
          <li key={item.href}>
            <ConsoleLink
              item={item}
              active={isAdminNavItemActive(item, pathname)}
              badge={item.badge ? badgeText : null}
            />
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <h2 className="px-3 pb-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted">
          More
        </h2>
        <ul className="flex flex-col gap-0.5">
          {ADMIN_NAV_MORE.map((item) => {
            const active = isAdminNavItemActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-ring flex h-9 items-center rounded-[10px] px-3 text-[13px] transition-colors",
                    active
                      ? "bg-accent/12 font-semibold text-accent-text"
                      : "font-medium text-fg-muted hover:bg-surface-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border-subtle px-2 pt-3">
        <Avatar src={null} name={user.username} className="h-[30px] w-[30px] text-[11px]" />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold text-fg">
            {user.display_name || user.username}
          </div>
          <div className="text-[11px] text-fg-muted">Administrator</div>
        </div>
      </div>
    </nav>
  );
}

function ConsoleLink({
  item,
  active,
  badge,
}: {
  item: AdminNavItem;
  active: boolean;
  badge: string | null;
}) {
  // Only the primary group carries an icon in the registry — the "More" group
  // is label-only by design, so the glyph is rendered when there is one.
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors",
        active ? "bg-accent/12 text-accent-text" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={1.9} className="shrink-0" /> : null}
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-[5px] text-[10.5px] font-bold tabular-nums text-danger-fg">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
