"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

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
import { cn } from "@/lib/cn";
import { useMessagingAvailable } from "@/lib/messaging/availability";
import {
  MENU_BUTTON_ATTR,
  SIDEBAR_ID,
  readCollapsed,
  readDrawerOpen,
  readImmersive,
  serverCollapsed,
  serverDrawerOpen,
  serverImmersive,
  setCollapsed,
  setDrawerOpen,
  subscribeCollapsed,
  subscribeDrawerOpen,
  subscribeImmersive,
} from "@/lib/sidebar-state";

// Sidebar is the desktop/tablet primary navigation (design-system.md: sidebar on
// desktop/tablet; the header's Menu button toggles it, and phones keep the
// BottomTabBar with no hamburger). It carries every primary destination plus the
// role-gated Moderation/Admin entries, marks the active route with aria-current,
// and is collapsible to an icon rail (labels stay in the accessibility tree via
// sr-only; the collapsed state persists). Hidden below `sm` (the BottomTabBar is
// the phone-width primary navigation) and on focused standalone routes (embeds
// and account entry).
//
// TWO PLACEMENTS, ONE PANEL (see SidebarPanel below — the link list is never
// forked):
//
//  1. In flow — the floating glass rail, the default everywhere.
//  2. Overlay drawer — while a page asks for an IMMERSIVE shell (theater mode on
//     the watch page, which is YouTube's behaviour: the guide closes and the
//     hamburger reopens it as an overlay). Closed, the rail renders nothing at
//     all so the theater band can span the full content width; open, the same
//     panel sits over a scrim that closes on click, as does Escape and any route
//     change. Focus enters the panel on open and returns to the header's Menu
//     button on close.
//
// The collapse preference, the immersive flag and the drawer flag all live in
// lib/sidebar-state so the header's Menu button drives exactly the same state
// this component renders (the two controls can never disagree).
export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, serverCollapsed);
  const immersive = useSyncExternalStore(subscribeImmersive, readImmersive, serverImmersive);
  const drawerOpen = useSyncExternalStore(subscribeDrawerOpen, readDrawerOpen, serverDrawerOpen);
  // Called before the standalone/admin early returns so the hook order is stable.
  const messagingAvailable = useMessagingAvailable();
  const panelRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const lastPath = useRef(pathname);

  // A navigation closes the drawer — an overlay that outlived the page it was
  // opened over would cover the destination it just took the viewer to.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setDrawerOpen(false);
  }, [pathname]);

  // Focus management for the overlay placement: in on open, back to the Menu
  // button on close. The button is found by its marker attribute rather than a
  // shared ref, because it lives in a sibling subtree (the header) that this
  // component has no handle on.
  useEffect(() => {
    const open = immersive && drawerOpen;
    if (open && !wasOpen.current) {
      panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    } else if (!open && wasOpen.current) {
      document.querySelector<HTMLElement>(`[${MENU_BUTTON_ATTR}]`)?.focus();
    }
    wasOpen.current = open;
  }, [immersive, drawerOpen]);

  // Escape closes the overlay (the dialog-dismissal idiom the rest of the app
  // uses). Bound only while it is open.
  useEffect(() => {
    if (!immersive || !drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [immersive, drawerOpen]);

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

  // Immersive + closed: no rail at all. This is the one state in which a page
  // with navigation renders none — the header's Menu button is what brings it
  // back, which is why that button is not optional.
  if (immersive && !drawerOpen) {
    return null;
  }

  const links: NavLinkDef[] = primaryNavLinks(messagingAvailable);
  if (user?.role === "admin" || user?.role === "moderator") links.push(MODERATION_LINK);
  if (user?.role === "admin") links.push(ADMIN_LINK);

  const panel = (
    // Sticky offset = the flush header's sm height (3.5rem) + the same 0.75rem
    // gap the panel keeps in flow, so it parks directly under the bar instead of
    // the 1.5rem gap the old floating (inset) header's offset left behind.
    // The panel itself must NOT scroll: an `inset: 0` pseudo-element (the glass
    // lit edge) whose containing block is a scroll container scrolls WITH the
    // content, so the highlight left the viewport the moment a tall sidebar
    // scrolled — measured at 1440x420, the top row went rgb(96,96,97) ->
    // rgb(31,31,32) at scrollTop 60. Scrolling an inner wrapper keeps the glass
    // box a fixed height, and keeps the scrollbar out of the rounded corner.
    <nav
      ref={panelRef}
      id={SIDEBAR_ID}
      aria-label="Primary"
      className={cn(
        "glass-chrome flex-col justify-between gap-2 rounded-sheet p-2 transition-[width] duration-200 motion-reduce:transition-none",
        immersive
          ? // Overlay placement: same panel, pinned beside the viewport edge at
            // the same offsets the in-flow rail keeps, above the scrim (z-40).
            "fixed bottom-3 left-3 top-[4.25rem] z-40 flex w-56"
          : "sticky top-[4.25rem] mb-3 ml-3 mt-3 hidden max-h-[calc(100vh-5rem)] shrink-0 self-start sm:flex",
        immersive ? null : collapsed ? "w-16" : "w-56",
      )}
    >
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <ul className="flex flex-col gap-0.5">
          {links.map((item) => (
            <li key={item.href}>
              <SidebarLink
                item={item}
                collapsed={railCollapsed(collapsed, immersive)}
                active={isActiveNavLink(item, pathname)}
              />
            </li>
          ))}
        </ul>
        <SidebarFollowing collapsed={railCollapsed(collapsed, immersive)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <SidebarLink
          item={{ href: "/about/instance/home", label: "About", Icon: InfoIcon }}
          collapsed={railCollapsed(collapsed, immersive)}
          active={pathname === "/about" || pathname?.startsWith("/about/") === true}
        />
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
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
          <span className={railCollapsed(collapsed, immersive) ? "sr-only" : "truncate"}>
            Collapse
          </span>
        </button>
      </div>
    </nav>
  );

  if (!immersive) return panel;

  return (
    <>
      {/* Scrim: dismiss-on-click, and the visual separation an overlay owes the
          page under it. Decorative — Escape and the Menu button are the
          keyboard/AT paths, so it is not a control in the a11y tree.
          It starts BELOW the header (3.5rem, the flush bar's sm+ height — the
          drawer only exists at sm+) so the bar it was opened from stays lit and
          clickable: the same Menu button has to be able to close it again, and
          dimming search and the account menu behind an unrelated overlay is not
          what a navigation drawer is for. */}
      <div
        aria-hidden
        data-testid="sidebar-scrim"
        onClick={() => setDrawerOpen(false)}
        className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/45"
      />
      {panel}
    </>
  );
}

/** The overlay drawer always shows labels: it is a temporary, deliberate visit
 * to the navigation, and a 64px icon rail floating over a dimmed page reads as
 * debris rather than as a menu. The stored preference is untouched — leaving
 * theater restores whatever the rail was. */
function railCollapsed(collapsed: boolean, immersive: boolean): boolean {
  return immersive ? false : collapsed;
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
