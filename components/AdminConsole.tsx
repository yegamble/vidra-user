"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import {
  GridIcon,
  type IconProps,
  ServerIcon,
  ShieldIcon,
  UsersIcon,
  VideoIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type ConsoleItem = {
  href: string;
  label: string;
  Icon: (props: IconProps) => ReactElement;
  /** Only lit when the path matches exactly (the Overview index). */
  exact?: boolean;
  /** Show the live open-reports count badge (the design's red Queues badge). */
  badge?: boolean;
};

// The design's five primary console destinations. Overview / Users / Instance are
// admin routes owned by this console shell; Queues / Content are the moderation
// surfaces — they link out to /moderation (which keeps its own moderator nav), so
// they never light up while the console is showing (it renders on /admin/* only).
const PRIMARY: readonly ConsoleItem[] = [
  { href: "/admin", label: "Overview", Icon: GridIcon, exact: true },
  { href: "/admin/users", label: "Users", Icon: UsersIcon },
  { href: "/moderation", label: "Queues", Icon: ShieldIcon, badge: true },
  { href: "/moderation/videos", label: "Content", Icon: VideoIcon },
  { href: "/admin/config", label: "Instance", Icon: ServerIcon },
];

// The remaining admin sub-surfaces the design's 5-item nav doesn't enumerate.
// Kept in a quiet "MORE" group so no admin route is stranded (there is no admin
// bottom-tab bar and the horizontal AdminTabs are hidden at this width).
const SECONDARY: readonly { href: string; label: string }[] = [
  { href: "/admin/registration-requests", label: "Registration" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/import-peertube", label: "Import" },
  { href: "/admin/media", label: "Media storage" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/system", label: "System" },
];

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
      .getReports({ openOnly: true, limit: REPORTS_PAGE }, controller.signal)
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
      <Link
        href="/"
        className="focus-ring mx-0.5 mb-3 flex items-baseline gap-2 rounded-lg px-2.5 py-1"
        aria-label="Vidra admin — back to the app"
      >
        <span className="text-[19px] font-bold tracking-[-0.04em] text-fg">Vidra</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-fg-muted">Admin</span>
      </Link>

      <ul className="flex flex-col gap-0.5">
        {PRIMARY.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <ConsoleLink item={item} active={Boolean(active)} badge={item.badge ? badgeText : null} />
            </li>
          );
        })}
      </ul>

      <div className="mt-5">
        <h2 className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-fg-muted">
          More
        </h2>
        <ul className="flex flex-col gap-0.5">
          {SECONDARY.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "focus-ring flex items-center rounded-[9px] px-3 py-2 text-[13px] transition-colors",
                    active
                      ? "bg-surface-muted font-semibold text-fg"
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
  item: ConsoleItem;
  active: boolean;
  badge: string | null;
}) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "focus-ring flex items-center gap-3 rounded-[9px] px-3 py-2 text-[13.5px] font-semibold transition-colors",
        active ? "bg-surface-muted text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      <Icon size={16} strokeWidth={1.9} className="shrink-0" />
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-[5px] text-[10.5px] font-bold tabular-nums text-danger-fg">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
