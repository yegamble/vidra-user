"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

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
import { isAdminConsoleRoute, isStandaloneRoute } from "@/lib/app-shell";
import { cn } from "@/lib/cn";
import { useMessagingAvailable } from "@/lib/messaging/availability";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import {
  MENU_BUTTON_ATTR,
  SIDEBAR_ID,
  readCollapsed,
  readDrawerOpen,
  readImmersive,
  serverCollapsed,
  serverDrawerOpen,
  serverImmersive,
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
// this component renders; the header is the sole collapse/expand control.
export function Sidebar() {
  const pathname = usePathname();
  const { user } = useSession();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, serverCollapsed);
  const immersive = useSyncExternalStore(subscribeImmersive, readImmersive, serverImmersive);
  const drawerOpen = useSyncExternalStore(subscribeDrawerOpen, readDrawerOpen, serverDrawerOpen);
  // Called before the standalone/admin early returns so the hook order is stable.
  const messagingAvailable = useMessagingAvailable();
  const lastPath = useRef(pathname);

  // A navigation closes the drawer — an overlay that outlived the page it was
  // opened over would cover the destination it just took the viewer to.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setDrawerOpen(false);
  }, [pathname]);

  if (isStandaloneRoute(pathname)) {
    return null;
  }

  // On the admin routes an admin gets the dedicated desktop console rail
  // (app/admin/layout.tsx → AdminConsole) as the single left nav, so the global
  // app sidebar steps aside there. Non-admins keep it (they only ever see the
  // page's "Administrators only" gate on /admin, not the console).
  if (isAdminConsoleRoute(pathname, user?.role)) {
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
      id={SIDEBAR_ID}
      aria-label="Primary"
      className={cn(
        "glass-chrome flex-col justify-between gap-2 rounded-sheet p-2 transition-[width] duration-200 motion-reduce:transition-none",
        immersive
          ? // Overlay placement: the same panel, pinned at the same offsets the
            // in-flow rail keeps, below the header (which stays lit and usable
            // — the Menu button has to be able to close what it opened) and
            // therefore under the header's z-index too. `.glass-chrome-solid`
            // because the page behind it here is the theater band's #000, where
            // the translucent material drops `fg-muted` to 3.74:1.
            "glass-chrome-solid fixed bottom-3 left-3 z-20 flex w-56 top-[calc(4.25rem+env(safe-area-inset-top))]"
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
      </div>
    </nav>
  );

  if (!immersive) return panel;

  return <SidebarDrawer onClose={() => setDrawerOpen(false)}>{panel}</SidebarDrawer>;
}

/**
 * SidebarDrawer — the overlay placement's modal shell. It is shaped like a
 * modal (it covers the page, it traps the eye, clicking outside dismisses it),
 * so it IS one: `role="dialog" aria-modal="true"`, the shared focus contract
 * (lib/use-dialog-focus: focus in on open, Tab trapped, Escape closes, focus
 * restored to the Menu button that opened it) and `inert` on `#main-content`
 * while it is up, so the page underneath is unreachable by pointer, caret and
 * assistive technology rather than merely covered.
 *
 * A separate component so the hook's mount-only lifecycle matches the drawer's:
 * it mounts when the drawer opens and unmounts when it closes. The panel itself
 * is passed in — one panel, two placements; the link list is never forked.
 */
function SidebarDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(wrapperRef, onClose);

  // Declared AFTER the hook so its cleanup runs after the hook's restore.
  // Safari does not focus a <button> on click, so "restore whatever was
  // focused" can legitimately land on <body>; the Menu button marks itself for
  // exactly this case, so the control that opened the drawer still gets focus
  // back on every browser.
  useEffect(() => {
    return () => {
      const active = document.activeElement;
      if (active === null || active === document.body) {
        document.querySelector<HTMLElement>(`[${MENU_BUTTON_ATTR}]`)?.focus();
      }
    };
  }, []);

  // `inert` (React 19 / baseline 2024) takes the page underneath out of reach
  // of pointer, caret and assistive technology — a scrim only covers it. The
  // header is a SIBLING of #main-content and deliberately stays reachable: the
  // Menu button must be able to close what it opened.
  useEffect(() => {
    const main = document.getElementById("main-content");
    main?.setAttribute("inert", "");
    return () => main?.removeAttribute("inert");
  }, []);

  return (
    // The dialog IS the overlay box — a zero-size wrapper around `fixed`
    // children has no bounding box, which reads as hidden to both assistive
    // technology heuristics and Playwright's visibility check.
    //
    // It starts BELOW the header (3.5rem plus the notch inset, so an installed
    // PWA's masthead is not covered either) and stays under the header's
    // z-index, so the bar the drawer was opened from is still lit and
    // clickable: the same Menu button has to be able to close what it opened,
    // and dimming search and the account menu behind a navigation overlay is
    // not what the overlay is for.
    <div
      ref={wrapperRef}
      role="dialog"
      aria-modal="true"
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-20 top-[calc(3.5rem+env(safe-area-inset-top))]"
    >
      {/* Scrim: dismiss-on-click, and the visual separation an overlay owes the
          page under it. Decorative — Escape and the Menu button are the
          keyboard/AT paths, so it is not a control in the a11y tree. */}
      <div
        aria-hidden
        data-testid="sidebar-scrim"
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
      />
      {children}
    </div>
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
