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
import { useVisiblePoll } from "@/lib/use-visible-poll";

// Both groups come from the one admin-nav registry (lib/admin-nav.ts): the
// design's five primary console destinations (Overview / Users / Instance are
// admin routes owned by this console shell; Queues / Content link out to the
// moderation surfaces, which keep their own moderator nav — so they never light
// up while the console is showing, it renders on /admin/* only), then the quiet
// "More" group of the remaining admin sub-surfaces the design's 5-item nav does
// not enumerate, so no admin route is stranded (there is no admin bottom-tab bar
// and the AdminTabs Select is hidden at this width).

// The badge count is capped for display; the exact figures live on the Overview
// callout and the queues themselves.
const BADGE_CAP = 99;
// Badge staleness bound while the tab is visible; navigation refetches at once.
const BADGE_POLL_MS = 60_000;

interface CountBadge {
  text: string;
  label: string;
}

// The bare number says nothing about what is waiting, so each badge carries its
// own label (title + screen-reader text): "2 open reports".
function countBadge(n: number | null, one: string, many: string): CountBadge | null {
  if (!n || n <= 0) return null;
  return { text: n > BADGE_CAP ? `${BADGE_CAP}+` : String(n), label: `${n} ${n === 1 ? one : many}` };
}

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
  const [pendingSignups, setPendingSignups] = useState<number | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const isAdmin = user?.role === "admin";

  // Refetch on every navigation (acting on a queue then moving on is exactly
  // when the count changes) and, via the repo's visibility-aware poll, while the
  // tab stays open. Fetching once on mount left the badge stale for the session.
  useEffect(() => {
    // GET /admin/registration-requests is requireRole(admin) in vidra-core
    // (internal/httpapi/server.go), and this console renders for admins only, so
    // one gate covers both reads; a moderator never draws a 403 per navigation.
    if (!isAdmin) return;
    const controller = new AbortController();
    // limit=1 + `total`: the page is irrelevant, only the match count is read.
    // Each source swallows its own failure (the badge is a convenience, never a
    // thrown rejection) and keeps its last value, so one failing source cannot
    // zero the other.
    api
      .getReports({ status: "open", limit: 1 }, controller.signal)
      .then((res) => setOpenReports(res.total))
      .catch(() => {});
    api
      .getRegistrationRequests({ status: "pending", limit: 1 }, controller.signal)
      .then((res) => setPendingSignups(res.total))
      .catch(() => {});
    return () => controller.abort();
  }, [isAdmin, pathname, pollKey]);

  useVisiblePoll({
    enabled: isAdmin,
    intervalMs: BADGE_POLL_MS,
    onPoll: () => setPollKey((k) => k + 1),
  });

  if (!isAdmin || !user) return null;

  // One badge per destination, each counting what its own page lists.
  const badges: Record<NonNullable<AdminNavItem["badge"]>, CountBadge | null> = {
    reports: countBadge(openReports, "open report", "open reports"),
    signups: countBadge(pendingSignups, "sign-up waiting for approval", "sign-ups waiting for approval"),
  };

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
              badge={item.badge ? badges[item.badge] : null}
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
                  <span className="truncate">{item.label}</span>
                  {item.badge ? <CountPill badge={badges[item.badge]} /> : null}
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
  badge: CountBadge | null;
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
      <CountPill badge={badge} />
    </Link>
  );
}

// The pill's only text is the number, so the link reads "Queues 3" (as it always
// has) and the DOM holds the count once. The full description rides in `title`
// for pointer users. Deliberately NOT an aria-label or an sr-only copy: both put
// "3 open reports" into the accessibility tree as label/text, which every label
// or text query on the admin pages then matches by substring (an `sr-only` copy
// collided with getByText("3"); an aria-label with getByLabel("Port"), via
// "re-port").
function CountPill({ badge }: { badge: CountBadge | null }) {
  if (!badge) return null;
  return (
    <span
      title={badge.label}
      className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-[5px] text-[10.5px] font-bold tabular-nums text-danger-fg"
    >
      {badge.text}
    </span>
  );
}
