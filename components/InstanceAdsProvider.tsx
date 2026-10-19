"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getInstanceCached } from "@/lib/api/instance-platform";
import type { InstanceResponse } from "@/lib/api/types";
import { getInstanceFeaturesSnapshot, INSTANCE_FEATURES_EVENT } from "@/lib/instance-features";

type Ads = NonNullable<InstanceResponse["ads"]>;
const AdsContext = createContext<Ads | null | undefined>(null);
const enabledAds = (ads: Ads | null | undefined): Ads | null => ads?.enabled === true ? ads : null;

export function InstanceAdsProvider({ ads, children }: { ads: Ads | null | undefined; children: ReactNode }) {
  const [previousSeed, setPreviousSeed] = useState(ads);
  const [snapshot, setSnapshot] = useState<Ads | null | undefined>(ads === undefined ? undefined : enabledAds(ads));
  if (ads !== previousSeed) {
    setPreviousSeed(ads);
    // An unavailable later read must not interrupt already-playing content.
    if (ads !== undefined) setSnapshot(enabledAds(ads));
  }

  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: number | undefined;
    const load = () => {
      const version = ++generation;
      let settled = false;
      window.clearTimeout(timer);
      const finish = (next: Ads | null | undefined) => {
        if (!active || settled || version !== generation) return;
        settled = true;
        window.clearTimeout(timer);
        // Only the initial unknown seed fails open; refresh failures keep the
        // last settled config. Late and superseded replies cannot replace it.
        setSnapshot((current) => next === undefined ? current ?? null : enabledAds(next));
      };
      timer = window.setTimeout(() => finish(undefined), 6000);
      // Reuse the page-wide public instance read; never fetch once per player.
      void getInstanceCached().then(
        (instance) => finish(instance?.ads ?? null),
        () => finish(undefined),
      );
    };
    const refresh = () => {
      // Saves invalidate first. Bootstrap completion also emits this event;
      // it must not restart a timed-out initial read after content has begun.
      if (getInstanceFeaturesSnapshot() === null) load();
    };
    window.addEventListener(INSTANCE_FEATURES_EVENT, refresh);
    if (ads === undefined) load();
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(INSTANCE_FEATURES_EVENT, refresh);
    };
  }, [ads]);

  return <AdsContext.Provider value={snapshot}>{children}</AdsContext.Provider>;
}

// Outside the provider, legacy consumers remain disabled. Within it, undefined
// gates content while an unavailable SSR snapshot gets its bounded client read.
export function useInstanceAds(): Ads | null | undefined {
  return useContext(AdsContext);
}
