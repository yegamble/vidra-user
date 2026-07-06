"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api";

// The five mobile destinations (design template "Vidra App": Home, Search,
// Create, Inbox, Library). Create routes to the Studio, where upload and
// go-live both live. Inbox covers notifications + messages.
type TabDef = {
  href: string;
  label: string;
  /** Route prefixes (besides href) that keep this tab marked active. */
  also?: readonly string[];
  icon: React.ReactNode;
  /** The oversized centered "Create" glyph gets no active state. */
  isCreate?: boolean;
};

function tabIcon(paths: React.ReactNode, size = 23) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      {paths}
    </svg>
  );
}

const TABS: readonly TabDef[] = [
  {
    href: "/",
    label: "Home",
    icon: tabIcon(
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </>,
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: tabIcon(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4-4" />
      </>,
    ),
  },
  {
    href: "/studio",
    label: "Create",
    isCreate: true,
    icon: (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        width={30}
        height={30}
      >
        <rect x="2.5" y="2.5" width="19" height="19" rx="6" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/notifications",
    label: "Inbox",
    also: ["/messages"],
    icon: tabIcon(
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </>,
    ),
  },
  {
    href: "/library",
    label: "Library",
    also: ["/playlists", "/history"],
    icon: tabIcon(
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m9 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none" />
        <path d="M19 5h2v14" />
      </>,
    ),
  },
];

function isTabActive(tab: TabDef, pathname: string | null): boolean {
  if (!pathname || tab.isCreate) return false;
  if (tab.href === "/") return pathname === "/";
  const prefixes = [tab.href, ...(tab.also ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * BottomTabBar — the phone-width primary navigation (design-system.md: mobile
 * bottom tabs; desktop/tablet sidebar; no hamburger). Sticky at the viewport
 * bottom, in-flow (so it never overlaps content), hidden at `sm` and up and on
 * the chrome-less /embed/* routes. The Inbox tab carries the unread dot the
 * same way the header bell does; active tabs are marked with aria-current.
 * Each target is a full-height flex cell (≥44pt touch target, Apple HIG).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const { status } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // Signed out there is nothing to fetch; the dot is also gated on `status`
    // below so a stale count can never render after sign-out.
    if (status !== "authed") return;
    const controller = new AbortController();
    api
      .getUnreadNotificationCount(controller.signal)
      .then((res) => setUnread(res.unread_count))
      .catch(() => {
        // A failed count is non-critical; leave the dot as-is.
      });
    return () => controller.abort();
  }, [status, pathname]);

  if (pathname?.startsWith("/embed")) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 border-t border-border-subtle bg-canvas/90 backdrop-blur pb-[max(env(safe-area-inset-bottom),0.25rem)] sm:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const active = isTabActive(tab, pathname);
          const showDot = tab.label === "Inbox" && status === "authed" && unread > 0;
          const label =
            showDot && unread > 0 ? `${tab.label} (${unread} unread)` : tab.label;
          return (
            <li key={tab.href + tab.label} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={`focus-ring relative mx-auto flex h-14 w-full max-w-20 flex-col items-center justify-center gap-1 rounded-xl ${
                  active ? "text-fg" : "text-fg-muted"
                }`}
              >
                <span className="relative flex">
                  {tab.icon}
                  {showDot ? (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger-solid ring-2 ring-canvas"
                    />
                  ) : null}
                </span>
                <span
                  className={`text-[10px] leading-none ${active ? "font-semibold" : "font-medium"}`}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
