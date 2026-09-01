"use client";

import { useInstanceFeatures } from "@/lib/instance-features";

/**
 * useMessagingAvailable — whether this instance offers direct messaging at all.
 *
 * The operator's `messaging_enabled` switch is disclosed on the public instance
 * document as `features.messaging` (the setting AND the messaging service being
 * wired at boot). While it is off EVERY /conversations, /messages,
 * /me/messaging-prefs and /attachments route answers 403 `feature_disabled` —
 * so the affordances must not be offered at all. A control that 403s when
 * clicked is worse than a control that is not there.
 *
 * The gate closes ONLY on an explicit `false`. An unknown answer — a core old
 * enough not to disclose the field, or the moment before the shared instance
 * fetch lands — reads as available, because hiding messaging from every
 * instance that never turned it off would be a far worse bug than the 403 this
 * prevents.
 */
export function useMessagingAvailable(): boolean {
  return useInstanceFeatures()?.messaging !== false;
}
