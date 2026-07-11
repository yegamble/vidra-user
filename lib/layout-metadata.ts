// Root-layout metadata builder seam (config-parity W2). app/layout.tsx calls
// buildRootMetadata(snapshot) from generateMetadata and never grows metadata
// logic of its own — later waves (W4 branding: icons + og:image + twitter:site)
// extend THIS module only.
//
// W2 contract: no visible behavior change. The builder returns exactly the
// values the layout hardcoded before the seam existed; the snapshot parameter
// is the wiring later waves consume (its branding/social blocks are absent
// until W1/W4 land anyway, and a null snapshot means the backend was
// unreachable — always fall back).

import type { Metadata } from "next";

import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

/** Today's hardcoded values — the fallback floor for every field. */
export const FALLBACK_TITLE = "Vidra";
export const FALLBACK_DESCRIPTION = "A federated, PeerTube-inspired video platform.";

export function buildRootMetadata(instance: InstanceConfigSnapshot | null): Metadata {
  // W4 wires branding.logos (icons, og:image) and social.twitter_username
  // (twitter:site) from the snapshot here. Until then the snapshot is
  // accepted-but-unused so the layout wiring is already proven.
  void instance;
  return {
    title: FALLBACK_TITLE,
    description: FALLBACK_DESCRIPTION,
  };
}
