"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { useOptionalSession } from "@/components/auth/AuthProvider";
import { MenuIcon, PlusIcon, PlusSquareIcon, TvIcon, UploadIcon } from "@/components/icons";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ProtocolRibbon } from "@/components/ProtocolRibbon";
import { SearchAutocomplete, SearchAutocompleteFallback } from "@/components/SearchAutocomplete";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";
import { isAdminConsoleRoute, isStandaloneRoute } from "@/lib/app-shell";
import { brandingAssetUrl } from "@/lib/branding";
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
import { NEUTRAL_BRAND_FALLBACK, brandName, hideSoftwareName } from "@/lib/software-brand";
import { useLiveAvailable } from "@/lib/live/availability";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// App shell header (design templates "Vidra App" + "Vidra Desktop"): the brand
// wordmark, centered pill search, Create, notifications, account. Primary
// navigation lives in the Sidebar (desktop/tablet) and the BottomTabBar
// (phones). The bar carries ONE nav control: a Menu button, left of the brand and
// desktop/tablet only (`hidden sm:inline-flex`) — it collapses/expands the rail,
// and in an immersive shell (theater mode) opens the rail as an overlay drawer.
// Phones keep the bottom tab bar and no hamburger (design-system.md). On phones the "Vidra"
// wordmark reads as the large page title of the mobile app template
// (text-2xl large-title feel) in a compact top row with a search icon button,
// the bell, and the avatar; Create collapses away there (it is a bottom tab).
// Tapping the search icon expands the full-screen search sheet. At sm+ the
// wordmark shrinks beside the centered search pill. Hidden on focused standalone
// routes (embeds and account entry).
//
// The bar is full-bleed: the chrome material spans the viewport edge to edge and
// sits flush against the top (`.glass-chrome-flush` drops the corner radius, the
// ring, and the shadow for a single bottom hairline), so the only inset is the
// row's own padding — aligned with sidebar columns on desktop while keeping
// the phone inset. Safe-area top padding keeps the row clear of a notch when the
// PWA runs standalone.
//
// Config-parity W4 branding: the SSR instance snapshot (passed down by
// app/layout.tsx; null when the backend is unreachable) supplies the header
// logo slots — header_wide for the sm+ header, header_square as the compact
// phone mark — and the instance name. The uploaded instance avatar is the
// PeerTube-style compact identity fallback when no typed header logo exists.
// branding.hide_instance_name drops the text ONLY when an image is actually
// set, so the header is never empty.
//
// branding.hide_software_name (white-label) changes only the LAST fallback: an
// instance that set no name of its own wears the software's name today, which is
// exactly what a white-labelled operator asked not to show. The slot then reads
// "Home" — the honest accessible name for a link to "/" — because an empty
// wordmark would break the "never renders an empty header" guarantee instead.
// The desktop "+ Create" menu — mirrors the mobile CreateSheet rows: the two
// primary creator flows (upload / go live), a divider, then New channel. Each
// row is a real link (deep-linking into the studio surface that auto-opens the
// flow). Protocol/status color stays inside the glyphs only: the upload arrow
// wears the accent, Go live wears the `live` token.
//
// The Go-live row is dropped when the instance reports `features.live: false`
// (the setting AND the RTMP ingest capability). A menu row that can only ever
// answer 403/503 is worse than no row.
function createItems(liveAvailable: boolean): DropdownItem[] {
  return [
    {
      label: "Upload video",
      href: "/studio/content?upload=1",
      icon: <UploadIcon size={18} className="text-accent-text" />,
    },
    ...(liveAvailable
      ? [
          {
            label: "Go live",
            href: "/studio/live?new=1",
            icon: <TvIcon size={18} className="text-live" />,
          } as DropdownItem,
        ]
      : []),
    { type: "separator" },
    {
      label: "New channel",
      href: "/studio/channel?create=1",
      icon: <PlusSquareIcon size={18} />,
    },
  ];
}

export function Header({ instance = null }: { instance?: InstanceConfigSnapshot | null }) {
  const pathname = usePathname();
  const liveAvailable = useLiveAvailable();
  // Shared state keeps the Menu button and rendered rail in sync — called
  // before the standalone early return so the hook order is stable.
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, serverCollapsed);
  const immersive = useSyncExternalStore(subscribeImmersive, readImmersive, serverImmersive);
  const drawerOpen = useSyncExternalStore(subscribeDrawerOpen, readDrawerOpen, serverDrawerOpen);
  // Optional (never throws): the header renders bare in unit tests, and the
  // role is only needed to answer "is there a sidebar here to toggle?".
  const role = useOptionalSession()?.user?.role;

  if (isStandaloneRoute(pathname)) {
    return null;
  }

  const name =
    brandName(instance?.name, hideSoftwareName(instance)) ?? NEUTRAL_BRAND_FALLBACK;
  const wideLogo = brandingAssetUrl(instance?.branding?.logos?.header_wide);
  const squareLogo = brandingAssetUrl(instance?.branding?.logos?.header_square);
  const avatar = brandingAssetUrl(instance?.branding?.avatar);
  const hasLogo = wideLogo !== null || squareLogo !== null || avatar !== null;
  const hideName = instance?.branding?.hide_instance_name === true && hasLogo;
  // Each breakpoint uses its intended slot, falling back to the other so one
  // uploaded logo still brands the whole header.
  const phoneLogo = squareLogo ?? avatar ?? wideLogo;
  const desktopLogo = wideLogo ?? squareLogo ?? avatar;

  return (
    <header className="glass-chrome glass-chrome-flush sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 w-full items-center gap-3 px-6 sm:h-14 sm:gap-5 sm:pl-5 sm:pr-8">
        {/* Group the desktop Menu and brand on the sidebar's icon/text columns;
            contents preserves the existing phone spacing without a Menu. */}
        <div className="contents sm:flex sm:items-center">
          {/* Sidebar control (design-system.md). Desktop/tablet only: phones keep
              the BottomTabBar and get no hamburger. Two behaviours, one button —
              normally it collapses/expands the in-flow rail through the shared
              store that the Sidebar renders;
              while a page asks for an IMMERSIVE shell (theater mode, where the rail
              is hidden outright) it opens that rail back as an overlay drawer.
              Absent on the admin console routes, where the app sidebar steps aside
              for the console's own rail: there is nothing there for it to toggle,
              and aria-controls pointing at an element that does not exist is a
              critical axe violation as well as a lie. */}
          {isAdminConsoleRoute(pathname, role) ? null : (
            <button
              type="button"
              {...{ [MENU_BUTTON_ATTR]: "" }}
              onClick={() => (immersive ? setDrawerOpen(!drawerOpen) : setCollapsed(!collapsed))}
              aria-label="Menu"
              aria-controls={SIDEBAR_ID}
              aria-expanded={immersive ? drawerOpen : !collapsed}
              className="focus-ring hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:inline-flex"
            >
              <MenuIcon size={22} strokeWidth={1.9} />
            </button>
          )}
          <Link
            href="/"
            className="focus-ring flex min-h-11 flex-col justify-center gap-1 rounded-lg"
          >
            {/* The SF wordmark (or operator logo). The tri-protocol ribbon sits
                directly under it — placement (a) of the three sanctioned ribbon
                uses; decorative (aria-hidden) so the link name stays the brand. */}
            <span className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-fg sm:gap-2 sm:text-xl sm:tracking-[-0.045em]">
              {phoneLogo !== null ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-uploaded image served by the backend, not a static asset
                <img
                  src={phoneLogo}
                  alt={hideName ? name : ""}
                  className="h-9 w-auto max-w-40 object-contain sm:hidden"
                />
              ) : null}
              {desktopLogo !== null ? (
                // eslint-disable-next-line @next/next/no-img-element -- operator-uploaded image served by the backend, not a static asset
                <img
                  src={desktopLogo}
                  alt={hideName ? name : ""}
                  className="hidden h-8 w-auto max-w-48 object-contain sm:block"
                />
              ) : null}
              {hideName ? null : <span>{name}</span>}
            </span>
            {hideSoftwareName(instance) ? null : <ProtocolRibbon />}
          </Link>
        </div>
        {/* The single site-search box: a centered pill at sm+, a search icon
            button that expands to a full-screen sheet on phones. It renders its
            own responsive layout (the desktop pill takes the centered flex-1
            slot; the phone trigger takes the trailing flex-1 slot), so the
            header needs no separate mobile spacer. Wrapped in Suspense because it
            reads useSearchParams (to reflect the /search query); the static twin
            keeps prerendered routes from bailing to CSR with no layout shift. */}
        <Suspense fallback={<SearchAutocompleteFallback />}>
          <SearchAutocomplete suggestionsEnabled={instance?.search?.suggestions_enabled !== false} />
        </Suspense>
        {/* Desktop "+ Create" — a menu deep-linking into the three creator flows
            (matches the mobile CreateSheet). The trigger keeps the header's
            outline "+ Create" pill styling; the menu is right-aligned. Hidden on
            phones, where Create is a bottom tab that opens the CreateSheet. */}
        <div className="hidden sm:flex">
          <Dropdown
            align="end"
            triggerLabel="Create"
            triggerClassName="!min-h-10 !gap-1.5 !rounded-[10px] !bg-transparent !px-4 !py-2 !text-[13px] hover:!bg-surface-raised/80"
            trigger={
              <>
                <PlusIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                Create
              </>
            }
            items={createItems(liveAvailable)}
          />
        </div>
        <NotificationsBell />
        <AccountMenu />
      </div>
    </header>
  );
}
