"use client";

// App-shell sidebar state. Pure module — no React, only guarded storage helpers
// — so the store is unit-testable in isolation (lib/sidebar-state.test.ts) and
// can be read by BOTH the Sidebar itself and the header's Menu button through
// the house useSyncExternalStore pattern (mirroring lib/player-theater). Before
// this module the collapse store was private to components/Sidebar.tsx, which is
// why a second control could not share it without prop-drilling through the
// layout.
//
// Three pieces of state, deliberately different in lifetime:
//
//  - COLLAPSED — a harmless UI preference (never a secret), so localStorage is
//    the right place for it to survive reloads. Key and event name are the
//    historical ones: e2e/sidebar.spec.ts pins the persistence behaviour and a
//    rename would silently reset every existing user's rail.
//  - IMMERSIVE — "a page is asking for the chrome to step aside" (theater mode
//    on the watch page). In memory ONLY: it is a property of the surface you are
//    looking at, not a preference, and persisting it would strand a viewer on a
//    home page with no navigation after a reload.
//  - DRAWER OPEN — whether the immersive overlay rail is showing. Also in-memory
//    only, and forced shut whenever immersive is turned off, so leaving theater
//    can never leave a stale overlay (or its scrim) on top of the page.

const COLLAPSE_KEY = "vidra.sidebar-collapsed";
const COLLAPSE_EVENT = "vidra:sidebar-collapsed";
const IMMERSIVE_EVENT = "vidra:sidebar-immersive";
const DRAWER_EVENT = "vidra:sidebar-drawer";

/* ── collapsed (persisted) ────────────────────────────────────────────────── */

/** subscribeCollapsed notifies on a change from this tab (the custom event) or
 * another one (`storage`). */
export function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

/** serverCollapsed is the SSR snapshot for useSyncExternalStore — always
 * expanded, so the server HTML never disagrees with the pre-hydration client. */
export function serverCollapsed(): boolean {
  return false;
}

export function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false; // Storage unavailable (private-mode restrictions) — stay expanded.
  }
}

export function setCollapsed(next: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    // The preference just won't persist.
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

export function toggleCollapsed(): void {
  setCollapsed(!readCollapsed());
}

/* ── immersive + drawer (in-memory) ───────────────────────────────────────── */

let immersive = false;
let drawerOpen = false;

export function subscribeImmersive(onChange: () => void): () => void {
  window.addEventListener(IMMERSIVE_EVENT, onChange);
  return () => window.removeEventListener(IMMERSIVE_EVENT, onChange);
}

export function serverImmersive(): boolean {
  return false;
}

export function readImmersive(): boolean {
  return immersive;
}

/**
 * setImmersive asks the shell to step aside (theater mode). Turning it OFF also
 * closes the drawer: the overlay rail only exists inside immersive mode, and a
 * leftover scrim would swallow every click on the restored page.
 */
export function setImmersive(on: boolean): void {
  if (immersive === on) return;
  immersive = on;
  if (!on && drawerOpen) setDrawerOpen(false);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(IMMERSIVE_EVENT));
}

export function subscribeDrawerOpen(onChange: () => void): () => void {
  window.addEventListener(DRAWER_EVENT, onChange);
  return () => window.removeEventListener(DRAWER_EVENT, onChange);
}

export function serverDrawerOpen(): boolean {
  return false;
}

export function readDrawerOpen(): boolean {
  return drawerOpen;
}

export function setDrawerOpen(on: boolean): void {
  if (drawerOpen === on) return;
  drawerOpen = on;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DRAWER_EVENT));
}

export function toggleDrawerOpen(): void {
  setDrawerOpen(!drawerOpen);
}

/** The id the drawer/rail carries, and the header Menu button's aria-controls. */
export const SIDEBAR_ID = "app-sidebar";

/** The header Menu button marks itself so the drawer can return focus to it on
 * close without the two components sharing a ref through the layout. */
export const MENU_BUTTON_ATTR = "data-sidebar-menu-button";
