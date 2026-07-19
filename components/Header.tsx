"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { PlusIcon } from "@/components/icons";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ProtocolRibbon } from "@/components/ProtocolRibbon";
import { SearchAutocomplete, SearchAutocompleteFallback } from "@/components/SearchAutocomplete";
import { isStandaloneRoute } from "@/lib/app-shell";
import { brandingAssetUrl } from "@/lib/branding";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// App shell header (design templates "Vidra App" + "Vidra Desktop"): the brand
// wordmark, centered pill search, Create, notifications, account. Primary
// navigation lives in the Sidebar (desktop/tablet) and the BottomTabBar
// (phones) — no hamburger menu (design-system.md). On phones the "Vidra"
// wordmark reads as the large page title of the mobile app template
// (text-2xl large-title feel) in a compact top row with a search icon button,
// the bell, and the avatar; Create collapses away there (it is a bottom tab).
// Tapping the search icon expands the full-screen search sheet. At sm+ the
// wordmark shrinks beside the centered search pill. Hidden on focused standalone
// routes (embeds and account entry).
//
// Config-parity W4 branding: the SSR instance snapshot (passed down by
// app/layout.tsx; null when the backend is unreachable) supplies the header
// logo slots — header_wide for the sm+ header, header_square as the compact
// phone mark — and the instance name. The uploaded instance avatar is the
// PeerTube-style compact identity fallback when no typed header logo exists.
// branding.hide_instance_name drops the text ONLY when an image is actually
// set, so the header is never empty.
export function Header({ instance = null }: { instance?: InstanceConfigSnapshot | null }) {
  const pathname = usePathname();

  if (isStandaloneRoute(pathname)) {
    return null;
  }

  const rawName = typeof instance?.name === "string" ? instance.name.trim() : "";
  const name = rawName !== "" ? rawName : "Vidra";
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
    <header className="sticky top-0 z-30 px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="glass-chrome mx-auto flex h-16 w-full items-center gap-3 rounded-[22px] px-4 sm:h-14 sm:gap-5 sm:px-5">
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
          <ProtocolRibbon />
        </Link>
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
        <Link
          href="/studio"
          className="focus-ring hidden min-h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-raised/80 sm:flex"
        >
          <PlusIcon size={14} strokeWidth={2.2} />
          Create
        </Link>
        <NotificationsBell />
        <AccountMenu />
      </div>
    </header>
  );
}
