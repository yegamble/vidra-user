import { describe, expect, it } from "vitest";

import { FALLBACK_DESCRIPTION, FALLBACK_TITLE, buildRootMetadata } from "./layout-metadata";

// W2 contract: the metadata builder seam exists but changes NOTHING visible —
// with or without a snapshot it returns exactly the values app/layout.tsx
// hardcoded before the seam (W4 starts consuming branding/social blocks).

describe("buildRootMetadata", () => {
  it("returns the hardcoded fallbacks when the backend is unreachable", () => {
    expect(buildRootMetadata(null)).toEqual({
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
    });
  });

  it("still returns today's values with a snapshot present (W2: no visible change)", () => {
    const snapshot = {
      name: "Renamed Instance",
      short_description: "Something else",
    } as Parameters<typeof buildRootMetadata>[0];
    expect(buildRootMetadata(snapshot)).toEqual({
      title: "Vidra",
      description: "A federated, PeerTube-inspired video platform.",
    });
  });
});
