"use client";

import { useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api";

// The "no-pretending" rule (spec §5): the encrypted-mode affordance appears ONLY
// when the backend advertises the E2EE contract. We probe GET /api/v1/e2ee/devices
// once per session — a non-404 means the route exists (contract present); a 404
// means an older backend without E2EE. 401 (not signed in) is treated as
// unavailable without caching, so a later signed-in probe can still succeed.

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function probe(): Promise<boolean> {
  try {
    await api.listMyE2EEDevices();
    cached = true;
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      cached = false; // route genuinely absent — remember it.
      return false;
    }
    // 401/network/other: unknown; do not cache a negative.
    return false;
  }
}

/** probeE2EEAvailable resolves whether the backend advertises the E2EE contract (session-cached). */
export function probeE2EEAvailable(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = probe().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * useE2EEAvailable returns whether encrypted messaging is available: null while
 * probing, then true/false. Only call from a context where the user is signed in
 * (the probe needs auth); anonymous callers get false.
 */
export function useE2EEAvailable(enabled: boolean): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(cached);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void probeE2EEAvailable().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  // Disabled (anonymous) callers never see the affordance; enabled callers get
  // the probed result (null while probing).
  return enabled ? available : false;
}

/** Test seam: reset the module-level availability cache between tests. */
export function __resetE2EEAvailabilityForTest(): void {
  cached = null;
  inflight = null;
}
