"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { getInstanceCached } from "@/lib/api/instance-platform";
import type { InstanceResponse } from "@/lib/api/types";
import { getInstanceFeaturesSnapshot, INSTANCE_FEATURES_EVENT } from "@/lib/instance-features";

type Analytics = InstanceResponse["analytics"] | null;

export function InstanceAnalytics({ analytics, nonce }: { analytics: Analytics; nonce: string }) {
  const [override, setOverride] = useState<{ seed: Analytics; value: Analytics } | null>(null);
  const current = override && override.seed === analytics ? override.value : analytics;
  useEffect(() => {
    let mounted = true;
    let generation = 0;
    const load = () => {
      const version = ++generation;
      void getInstanceCached().then(instance => {
        if (mounted && version === generation) setOverride({ seed: analytics, value: instance.analytics ?? null });
      }, () => {});
    };
    const refresh = () => {
      if (getInstanceFeaturesSnapshot() !== null) return;
      // Admin invalidation fails closed, including when the refresh fails.
      setOverride({ seed: analytics, value: null });
      load();
    };
    window.addEventListener(INSTANCE_FEATURES_EVENT, refresh);
    if (analytics === undefined) load();
    return () => { mounted = false; window.removeEventListener(INSTANCE_FEATURES_EVENT, refresh); };
  }, [analytics]);
  const enabled = current?.google_enabled === true;
  return (
    <div className="mx-4 my-3 empty:hidden sm:mx-6">
      <GoogleAnalytics enabled={enabled} measurementId={enabled ? current.google_measurement_id : ""} nonce={nonce} />
    </div>
  );
}
