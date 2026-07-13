"use client";

import { useEffect, useSyncExternalStore } from "react";

import { getInstanceCached, invalidateInstanceCache, type InstanceResponse } from "@/lib/api";

export type InstanceFeatures = InstanceResponse["features"];

const EVENT = "vidra:instance-features";
let current: InstanceFeatures | null = null;
let primed = false;
let generation = 0;

export function getInstanceFeaturesSnapshot(): InstanceFeatures | null {
  return current;
}

function serverSnapshot(): InstanceFeatures | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

/** Load the public instance capability document once per page. */
export function primeInstanceFeatures(): void {
  if (typeof window === "undefined" || primed) return;
  primed = true;
  const requestGeneration = generation;
  getInstanceCached()
    .then((instance) => {
      if (requestGeneration !== generation) return;
      current = instance.features;
      window.dispatchEvent(new Event(EVENT));
    })
    .catch(() => {
      if (requestGeneration !== generation) return;
      primed = false;
    });
}

/** Public runtime feature gates, or null until the shared instance fetch lands. */
export function useInstanceFeatures(): InstanceFeatures | null {
  useEffect(() => primeInstanceFeatures(), []);
  return useSyncExternalStore(subscribe, getInstanceFeaturesSnapshot, serverSnapshot);
}

/**
 * Drop the old capability snapshot after a successful admin configuration
 * write, fail closed immediately, then fetch the new effective public gates.
 */
export function refreshInstanceFeatures(): void {
  generation += 1;
  invalidateInstanceCache();
  current = null;
  primed = false;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  primeInstanceFeatures();
}

/** Test-only feature snapshot injection/reset. */
export function setInstanceFeaturesForTests(features: InstanceFeatures | null): void {
  generation += 1;
  current = features;
  primed = features !== null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export { EVENT as INSTANCE_FEATURES_EVENT };
