"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/auth/AccountMenu";
import { PlusIcon } from "@/components/icons";
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
    <header className="sticky top-0 z-30 px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="glass-chrome mx-auto flex h-16 w-full items-center gap-3 rounded-[22px] px-4 sm:h-14 sm:gap-5 sm:px-5">
        <Link
          href="/"
          className="focus-ring flex min-h-11 items-center rounded-lg text-2xl font-bold tracking-tight text-fg sm:text-xl sm:tracking-[-0.045em]"
        >
          Vidra
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center px-2 sm:flex">
          <SearchBox />
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
