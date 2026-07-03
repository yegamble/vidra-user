"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AdminNavLink } from "@/components/AdminNavLink";
import { AccountMenu } from "@/components/auth/AccountMenu";
import { ModerationNavLink } from "@/components/ModerationNavLink";
import { NAV_LINKS } from "@/components/nav-links";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SearchBox } from "@/components/SearchBox";

const MOBILE_LINK_CLASS =
  "block rounded-md px-3 py-2 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

// App shell header: brand + search + account menu (the desktop/tablet primary
// nav lives in the Sidebar). On small screens the nav links and auth controls
// collapse into an accessible disclosure menu behind a hamburger button
// (aria-expanded/aria-controls, Escape / outside-click / route-change close,
// focus moved into the menu on open and restored to the button on close).
// Hidden on the embeddable player routes (/embed/*), which are meant to be
// iframed bare. NOTE: design-system.md prefers mobile bottom tabs over a
// hamburger — the disclosure menu stays until that bottom-tab shell lands
// (tracked in fix_plan P2).
export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  // Focus the first menu item when the menu opens so keyboard/screen-reader
  // users land inside it instead of having to tab past the rest of the header.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [menuOpen]);

  // While open: Escape dismisses (restoring focus to the toggle) and any
  // pointer press outside the menu or its button dismisses quietly.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  // Following any link inside the menu (nav destinations or the account
  // controls) closes it and hands focus back to the toggle so it isn't dropped
  // on the document body after the route changes. Event delegation so links
  // rendered by nested components (AccountMenu) are covered too.
  function onMenuClick(e: React.MouseEvent<HTMLElement>) {
    if (!(e.target instanceof Element)) return;
    if (!e.target.closest("a")) return;
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  if (pathname?.startsWith("/embed")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:gap-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          Vidra
        </Link>
        <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-2">
          <SearchBox />
        </div>
        <NotificationsBell />
        <div className="hidden sm:flex">
          <AccountMenu />
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 sm:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            {menuOpen ? (
              <path d="M18 6 6 18M6 6l12 12" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>
      </div>
      {menuOpen ? (
        <nav
          id="mobile-menu"
          ref={menuRef}
          aria-label="Primary"
          onClick={onMenuClick}
          className="border-t border-zinc-200 sm:hidden dark:border-zinc-800"
        >
          <div className="flex flex-col px-2 py-2 text-sm text-zinc-700 dark:text-zinc-300">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={MOBILE_LINK_CLASS}>
                {link.label}
              </Link>
            ))}
            <ModerationNavLink className={MOBILE_LINK_CLASS} />
            <AdminNavLink className={MOBILE_LINK_CLASS} />
          </div>
          <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <AccountMenu />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
