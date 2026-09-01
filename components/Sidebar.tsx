"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { InfoIcon } from "@/components/icons";
import {
  ADMIN_LINK,
  MODERATION_LINK,
  isActiveNavLink,
  primaryNavLinks,
  type NavLinkDef,
} from "@/components/nav-links";
import { SidebarFollowing } from "@/components/SidebarFollowing";
import { isStandaloneRoute } from "@/lib/app-shell";
import { useMessagingAvailable } from "@/lib/messaging/availability";

// The collapse preference is a harmless UI setting (never a secret/token), so
// localStorage is the right place for it to survive reloads. It is read through
// useSyncExternalStore: the server snapshot is "expanded", and the client
// snapshot takes over after hydration (no server/client render mismatch).
const COLLAPSE_KEY = "vidra.sidebar-collapsed";
const COLLAPSE_EVENT = "vidra:sidebar-collapsed";

function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false; // Storage unavailable (private-mode restrictions) — stay expanded.
  }
}

function writeCollapsed(next: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    // The preference just won't persist.
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

// Sidebar is the desktop/tablet primary navigation (design-system.md: sidebar on
// desktop/tablet, no hamburger for primary nav). It carries every primary
// destination plus the role-gated Moderation/Admin entries, marks the active
// route with aria-current, and is collapsible to an icon rail (labels stay in
// the accessibility tree via sr-only; the collapsed state persists). Hidden
// below `sm` (the BottomTabBar is the phone-width primary navigation) and on
// focused standalone routes (embeds and account entry).
export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // Called before the standalone/admin early returns so the hook order is stable.
  const messagingAvailable = useMessagingAvailable();

  function toggle() {
    writeCollapsed(!collapsed);
  }

  if (isStandaloneRoute(pathname)) {
    return null;
  }

  // On the admin routes an admin gets the dedicated desktop console rail
  // (app/admin/layout.tsx → AdminConsole) as the single left nav, so the global
  // app sidebar steps aside there. Non-admins keep it (they only ever see the
  // page's "Administrators only" gate on /admin, not the console).
  if (pathname?.startsWith("/admin") && user?.role === "admin") {
    return null;
  }

  const links: NavLinkDef[] = primaryNavLinks(messagingAvailable);
  if (user?.role === "admin" || user?.role === "moderator") links.push(MODERATION_LINK);
  if (user?.role === "admin") links.push(ADMIN_LINK);

  return (
    // Sticky offset = the flush header's sm height (3.5rem) + the same 0.75rem
    // gap the panel keeps in flow, so it parks directly under the bar instead of
    // the 1.5rem gap the old floating (inset) header's offset left behind.
    <nav
      aria-label="Primary"
      className={`glass-chrome sticky top-[4.25rem] mb-3 ml-3 mt-3 hidden max-h-[calc(100vh-5rem)] shrink-0 flex-col justify-between gap-2 self-start overflow-y-auto rounded-[22px] p-2 transition-[width] duration-200 motion-reduce:transition-none sm:flex ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-0.5">
          {links.map((item) => (
            <li key={item.href}>
              <SidebarLink
                item={item}
                collapsed={collapsed}
                active={isActiveNavLink(item, pathname)}
              />
            </li>
          ))}
        </ul>
        <SidebarFollowing collapsed={collapsed} />
      </div>
      <div className="flex flex-col gap-0.5">
        <SidebarLink
          item={{ href: "/about/instance/home", label: "About", Icon: InfoIcon }}
          collapsed={collapsed}
          active={pathname === "/about" || pathname?.startsWith("/about/") === true}
        />
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="focus-ring flex min-h-11 items-center gap-3 rounded-[12px] px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[18px] w-[18px] shrink-0"
          >
            {collapsed ? <path d="M13 17l5-5-5-5M6 17l5-5-5-5" /> : <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />}
          </svg>
          <span className={collapsed ? "sr-only" : "truncate"}>Collapse</span>
        </button>
      </div>
    </nav>
  );
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavLinkDef;
  collapsed: boolean;
  active: boolean;
}) {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`focus-ring flex min-h-11 items-center gap-3 rounded-[12px] px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent/12 font-semibold text-accent-text"
          : "font-medium text-fg-muted hover:bg-surface-muted hover:text-fg"
      }`}
    >
      <Icon size={18} strokeWidth={1.9} className="shrink-0" />
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
    </Link>
  );
}
