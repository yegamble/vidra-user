"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import {
  ADMIN_LINK,
  MODERATION_LINK,
  NAV_LINKS,
  isActiveNavLink,
  type NavLinkDef,
} from "@/components/nav-links";

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
// below `sm` (the header's disclosure menu covers phones until the bottom-tab
// shell lands) and on the chrome-less /embed/* routes.
export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  function toggle() {
    writeCollapsed(!collapsed);
  }

  if (pathname?.startsWith("/embed")) {
    return null;
  }

  const links: NavLinkDef[] = [...NAV_LINKS];
  if (user?.role === "admin" || user?.role === "moderator") links.push(MODERATION_LINK);
  if (user?.role === "admin") links.push(ADMIN_LINK);

  return (
    <nav
      aria-label="Primary"
      className={`sticky top-14 hidden max-h-[calc(100vh-3.5rem)] shrink-0 flex-col justify-between gap-2 self-start overflow-y-auto border-r border-zinc-200 p-2 transition-[width] duration-200 motion-reduce:transition-none sm:flex dark:border-zinc-800 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
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
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0"
        >
          {collapsed ? <path d="M13 17l5-5-5-5M6 17l5-5-5-5" /> : <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />}
        </svg>
        <span className={collapsed ? "sr-only" : "truncate"}>Collapse</span>
      </button>
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
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 ${
        active
          ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5 shrink-0"
      >
        <path d={item.iconPath} />
      </svg>
      <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
    </Link>
  );
}
