"use client";

import { useInstanceFeatures } from "@/lib/instance-features";

/**
 * useLiveAvailable — whether this instance can actually run a live stream.
 *
 * `features.live` on the public instance document is the EFFECTIVE answer: the
 * operator's `live_enabled` switch AND the deployment's RTMP ingest capability
 * (core reads `LIVE_RTMP_URL`). Either half missing and `POST
 * /channels/{handle}/live` refuses — 403 `feature_disabled` for the switch, 503
 * `live_not_configured` for the missing ingest — so the "Go live" affordances
 * must not be offered. Before core ANDed the boot half in, the switch alone
 * advertised live on an instance with no ingest plane and the create call
 * answered 201 with a stream key and no `rtmp_url`: the creator got a
 * credential and nowhere to publish it.
 *
 * The gate closes ONLY on an explicit `false`, mirroring useMessagingAvailable:
 * an unknown answer — a core old enough not to disclose the field, or the
 * moment before the shared instance fetch lands — reads as available, because
 * hiding live from every instance that never turned it off would be a worse bug
 * than the refusal this prevents.
 */
export function useLiveAvailable(): boolean {
  return useInstanceFeatures()?.live !== false;
}
