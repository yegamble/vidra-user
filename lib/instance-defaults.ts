// Client-side instance defaults holder (config-parity W5). The public GET
// /instance `defaults{}` block, exposed to CLIENT components that need it
// synchronously (the player's autoplay seeding, video-miniature naming). The
// server pages read the SSR snapshot (lib/instance-config.server.ts) directly;
// this module is the browser-side counterpart, backed by the same module-level
// cached fetch every card/policy consumer shares (lib/api getInstanceCached —
// one request per page load).
//
// Shape: a useSyncExternalStore-compatible external store (the house pattern,
// see lib/player-settings.ts). It starts null — "no instance signal", every
// consumer falls back to today's hardcoded behavior, so a missing/old backend
// (or the mocked e2e suite, which runs with no backend) can never change
// rendering — and flips exactly once when the cached fetch resolves.

import { useEffect, useSyncExternalStore } from "react";

import { getInstanceCached } from "@/lib/api";
import type { InstanceConfigSnapshot, InstanceDefaultsBlock } from "@/lib/instance-config.server";

const EVENT = "vidra:instance-defaults";

let current: InstanceDefaultsBlock | null = null;
let primed = false;

/** The current defaults block, or null while unknown / when the backend has none. */
export function getInstanceDefaultsSnapshot(): InstanceDefaultsBlock | null {
  return current;
}

/** SSR/first-client snapshot for useSyncExternalStore — always null (no mismatch). */
export function serverInstanceDefaults(): InstanceDefaultsBlock | null {
  return null;
}

/**
 * Kick the shared instance fetch once and install the defaults block when it
 * lands (broadcasting to every subscriber). A failed fetch stays null — the
 * hardcoded fallbacks apply — and a later prime retries because the underlying
 * cache clears itself on failure.
 */
export function primeInstanceDefaults(): void {
  if (typeof window === "undefined" || primed) return;
  primed = true;
  getInstanceCached()
    .then((res) => {
      current = (res as InstanceConfigSnapshot).defaults ?? null;
      window.dispatchEvent(new Event(EVENT));
    })
    .catch(() => {
      primed = false; // retry on the next prime — getInstanceCached dropped its cache too
    });
}

export function subscribeInstanceDefaults(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/**
 * useInstanceDefaults subscribes a component to the defaults block (priming
 * the fetch on mount). null while unknown — consumers keep today's behavior.
 */
export function useInstanceDefaults(): InstanceDefaultsBlock | null {
  useEffect(() => {
    primeInstanceDefaults();
  }, []);
  return useSyncExternalStore(
    subscribeInstanceDefaults,
    getInstanceDefaultsSnapshot,
    serverInstanceDefaults,
  );
}

/** Test-only: install a defaults block directly (and broadcast), or reset with null. */
export function setInstanceDefaultsForTests(defaults: InstanceDefaultsBlock | null): void {
  current = defaults;
  primed = defaults !== null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export { EVENT as INSTANCE_DEFAULTS_EVENT };
