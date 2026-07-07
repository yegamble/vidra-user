"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SearchBox } from "@/components/SearchBox";

// App shell header (design templates "Vidra App" + "Vidra Desktop"): the brand
// wordmark, centered pill search, Create, notifications, account. Primary
// navigation lives in the Sidebar (desktop/tablet) and the BottomTabBar
// (phones) — no hamburger menu (design-system.md). On phones the "Vidra"
// wordmark reads as the large page title of the mobile app template
// (text-2xl large-title feel) in a compact top row with just the bell + avatar;
// the search box and Create collapse away there (Search and Create are bottom
// tabs). At sm+ it settles into the smaller desktop wordmark beside the centered
// search. Hidden on the embeddable player routes (/embed/*), iframed bare.
export function Header() {
  const pathname = usePathname();

  if (pathname?.startsWith("/embed")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border-subtle bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full items-center gap-3 px-4 sm:h-14 sm:gap-5 sm:px-6">
        <Link
          href="/"
          className="focus-ring rounded-lg text-2xl font-bold tracking-tight text-fg sm:text-xl sm:tracking-[-0.045em]"
        >
          Vidra
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
          <SearchBox />
        </div>
        <div className="flex-1 sm:hidden" />
        <Link
          href="/studio"
          className="focus-ring hidden items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted sm:flex"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create
        </Link>
        <NotificationsBell />
        <AccountMenu />
      </div>
    </header>
  );
}
