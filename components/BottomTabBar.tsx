"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { useT } from "@/components/I18nProvider";
import { CreateSheet } from "@/components/CreateSheet";
import {
  BellIcon,
  HomeIcon,
  LibraryIcon,
  PlusSquareIcon,
  SearchIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import { isStandaloneRoute } from "@/lib/app-shell";
import type { PlainMessageKey } from "@/lib/i18n";

// The five mobile destinations (design "Vidra App": Home, Search, Create, Inbox,
// Library). Create is not a route — it opens the Create bottom sheet (Upload /
// Go live / Open Studio). Inbox covers notifications + messages.
type TabDef = {
  href: string;
  labelKey: PlainMessageKey;
  /** Route prefixes (besides href) that keep this tab marked active. */
  also?: readonly string[];
  icon: React.ReactNode;
  /** The oversized centered "Create" tab opens the sheet instead of navigating. */
  isCreate?: boolean;
};

const TABS: readonly TabDef[] = [
  { href: "/", labelKey: "nav.home", icon: <HomeIcon size={23} /> },
  { href: "/search", labelKey: "nav.search", icon: <SearchIcon size={23} /> },
  {
    href: "/studio",
    labelKey: "nav.create",
    isCreate: true,
    // 30px rounded plus-square (rx6), lighter 1.5 stroke — the design's create glyph.
    icon: <PlusSquareIcon size={30} strokeWidth={1.5} />,
  },
  {
    href: "/notifications",
    labelKey: "nav.inbox",
    also: ["/messages"],
    icon: <BellIcon size={23} />,
  },
  {
    href: "/library",
    labelKey: "nav.library",
    also: ["/playlists", "/history"],
    icon: <LibraryIcon size={23} />,
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
 * focused standalone routes (embeds and account entry). The Inbox tab carries the unread dot the
 * same way the header bell does; active tabs are marked with aria-current. The
 * Create tab opens the Create bottom sheet (a dialog) rather than navigating.
 * Each target is a full-height flex cell (≥44pt touch target, Apple HIG).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const t = useT();
  const { status } = useSession();
  const [unread, setUnread] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

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

  if (isStandaloneRoute(pathname)) {
    return null;
  }

  return (
    <>
      <nav
        aria-label={t("nav.primary")}
        className="sticky bottom-0 z-30 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 sm:hidden"
      >
        <ul className="glass-chrome relative flex items-stretch justify-around rounded-sheet p-1">
          {TABS.map((tab) => {
            const active = isTabActive(tab, pathname);
            const cellClass = `focus-ring relative mx-auto flex h-14 w-full max-w-20 flex-col items-center justify-center gap-1 rounded-[17px] transition-colors ${
              active
                ? "bg-accent/12 text-accent-text"
                : "text-fg-muted hover:bg-surface-muted/70 hover:text-fg"
            }`;

            if (tab.isCreate) {
              return (
                <li key={tab.href + tab.labelKey} className="flex-1">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={createOpen}
                    aria-label={t(tab.labelKey)}
                    className={`${cellClass} bg-transparent`}
                  >
                    <span className="relative flex">{tab.icon}</span>
                    <span className="text-[10px] font-medium leading-none">{t(tab.labelKey)}</span>
                  </button>
                </li>
              );
            }

            const showDot = tab.labelKey === "nav.inbox" && status === "authed" && unread > 0;
            const label = showDot ? t("nav.inbox.unread", { count: unread }) : t(tab.labelKey);
            return (
              <li key={tab.href + tab.labelKey} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cellClass}
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
                    {t(tab.labelKey)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <CreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
