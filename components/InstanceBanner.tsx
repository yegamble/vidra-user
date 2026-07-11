import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// InstanceBanner is the root-layout banner SLOT (config-parity W2 seam). W3's
// broadcast-message banner renders here (styled per broadcast.level via the
// existing tokens, markdown body, localStorage dismissal keyed by message
// hash) without ever touching app/layout.tsx again. Until W3 lands it renders
// nothing — even if a newer backend already serves a broadcast block, the
// banner UI simply does not exist yet.
export function InstanceBanner({ instance }: { instance: InstanceConfigSnapshot | null }) {
  void instance;
  return null;
}
