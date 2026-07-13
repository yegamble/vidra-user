"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { PlusIcon } from "@/components/icons";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SearchBox } from "@/components/SearchBox";
import { isStandaloneRoute } from "@/lib/app-shell";
import { brandingAssetUrl } from "@/lib/branding";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// App shell header (design templates "Vidra App" + "Vidra Desktop"): the brand
// wordmark, centered pill search, Create, notifications, account. Primary
// navigation lives in the Sidebar (desktop/tablet) and the BottomTabBar
// (phones) — no hamburger menu (design-system.md). On phones the "Vidra"
// wordmark reads as the large page title of the mobile app template
// (text-2xl large-title feel) in a compact top row with just the bell + avatar;
// the search box and Create collapse away there (Search and Create are bottom
// tabs). At sm+ it settles into the smaller desktop wordmark beside the centered
// search. Hidden on focused standalone routes (embeds and account entry).
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
          className="focus-ring flex min-h-11 items-center gap-2.5 rounded-lg text-2xl font-bold tracking-tight text-fg sm:gap-2 sm:text-xl sm:tracking-[-0.045em]"
        >
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
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
          <SearchBox search={instance?.search} />
        </div>
        <div className="flex-1 sm:hidden" />
        <Link
          href="/studio"
          className="focus-ring hidden min-h-10 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-raised/80 sm:flex"
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
