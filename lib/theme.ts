"use client";

import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme-bootstrap";

/*
 * Theme preference store. The preference is a harmless UI setting (never a
 * secret), so localStorage is the right home for it — same pattern as the
 * sidebar-collapsed preference. Three values:
 *
 *   "system" (default) — no data-theme attribute; CSS `color-scheme: light dark`
 *                        follows the OS, including live OS-level changes.
 *   "light" / "dark"   — <html data-theme="…"> pins `color-scheme`, overriding
 *                        the OS for every `light-dark()` token at once.
 *
 * The inline script in app/layout.tsx applies the stored value before first
 * paint (no flash); this module owns every later change. Components read it
 * through useThemePreference() (useSyncExternalStore: the server snapshot is
 * "system", the client snapshot takes over after hydration).
 */

export type ThemePreference = "light" | "dark" | "system";

// The storage key lives in lib/theme-bootstrap.ts (a server-safe module) so
// the SSR layout's inline bootstrap script and this store can never drift.
const THEME_KEY = THEME_STORAGE_KEY;
const THEME_EVENT = "vidra:theme";

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system"; // Storage unavailable (private-mode restrictions) — follow the OS.
  }
}

/** Reflect a preference onto <html> so the CSS tokens switch scheme. */
function applyThemePreference(preference: ThemePreference): void {
  if (preference === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, preference);
    }
  } catch {
    // The preference just won't persist beyond this page.
  }
  applyThemePreference(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribeThemePreference(onChange: () => void): () => void {
  // `storage` keeps other tabs in sync; the custom event covers this tab.
  function onStorage(e: StorageEvent) {
    if (e.key !== null && e.key !== THEME_KEY) return;
    applyThemePreference(readThemePreference());
    onChange();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/** The current theme preference, live-updating across tabs. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeThemePreference, readThemePreference, () => "system");
}

// The no-flash bootstrap script itself moved to lib/theme-bootstrap.ts
// (buildThemeBootstrapScript), which app/layout.tsx inlines with the SSR
// instance snapshot's default theme.
