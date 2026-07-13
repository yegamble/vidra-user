"use client";

import { useSyncExternalStore } from "react";

export type DisplayLanguage = "en";

const RESTRICTED_KEY = "vidra.restricted-mode";
const LANGUAGE_KEY = "vidra.display-language";
const EVENT = "vidra:device-preferences";

function readRestricted(): boolean {
  try { return localStorage.getItem(RESTRICTED_KEY) === "true"; } catch { return false; }
}

function readLanguage(): DisplayLanguage {
  return "en";
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RESTRICTED_KEY || event.key === LANGUAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useRestrictedMode(): boolean {
  return useSyncExternalStore(subscribe, readRestricted, () => false);
}

export function writeRestrictedMode(value: boolean): void {
  try { localStorage.setItem(RESTRICTED_KEY, String(value)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useDisplayLanguage(): DisplayLanguage {
  return useSyncExternalStore(subscribe, readLanguage, () => "en");
}

export function writeDisplayLanguage(value: DisplayLanguage): void {
  try { localStorage.setItem(LANGUAGE_KEY, value); } catch {}
  document.documentElement.lang = value;
  window.dispatchEvent(new Event(EVENT));
}
