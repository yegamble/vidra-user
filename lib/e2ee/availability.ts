"use client";

import { useInstanceFeatures } from "@/lib/instance-features";

// The "no-pretending" rule (spec §5): the encrypted-mode affordance appears ONLY
// when E2EE is actually available. The instance document says so directly —
// `features.messaging_e2ee` is `messaging_e2ee_enabled` AND `messaging_enabled`
// AND the service wired at boot — and the OpenAPI contract is explicit that this
// flag, not a probe, is the authoritative signal.
//
// This used to infer availability by calling GET /api/v1/e2ee/devices once per
// session and reading a 404 as "older backend". A 403 did fall through to false,
// so a gated-off instance read as unavailable — but only by accident, and the
// probe was wrong in four ways regardless:
//   • it collapsed three different situations — disabled by operator policy, not
//     signed in (401), and a transport failure — into one answer;
//   • it spent a request per session to learn something the app already fetches;
//   • it could not answer for a logged-out visitor at all, since it needed auth;
//   • and it said nothing about `features.messaging`, the coarser switch that
//     hides the whole surface (see lib/messaging/availability.ts).

/**
 * useE2EEAvailable returns whether encrypted messaging is available: null while
 * the instance document is still unknown, then true/false. `enabled` is the
 * caller's own precondition (e.g. "these account controls apply at all"); a
 * disabled caller gets a plain false and never the pending null.
 *
 * Callers render the affordance on an explicit `true` only, so the pending null
 * is what stops the encrypted option from flashing on and then vanishing.
 */
export function useE2EEAvailable(enabled: boolean): boolean | null {
  const features = useInstanceFeatures();
  if (!enabled) return false;
  if (features === null) return null;
  // Absent means "this core predates the disclosure", not "off": treating it as
  // unavailable would hide E2EE from every instance running an older backend.
  return features.messaging_e2ee !== false;
}
