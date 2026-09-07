// @vitest-environment jsdom
//
// The live capability gate. `features.live` is core's EFFECTIVE answer (the
// live_enabled setting AND the deployment's RTMP ingest), and the create call
// refuses — 403 feature_disabled or 503 live_not_configured — whenever it is
// false, so every "Go live" affordance reads this.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  getInstanceCached: vi.fn(() => new Promise(() => {})),
  invalidateInstanceCache: vi.fn(),
}));

import { setInstanceFeaturesForTests } from "@/lib/instance-features";

import { useLiveAvailable } from "./availability";

function Probe() {
  return <span data-testid="live">{useLiveAvailable() ? "yes" : "no"}</span>;
}

function read(): string {
  return screen.getByTestId("live").textContent ?? "";
}

afterEach(() => {
  cleanup();
  setInstanceFeaturesForTests(null);
});

describe("useLiveAvailable", () => {
  it("is false only on an explicit false", () => {
    setInstanceFeaturesForTests({ live: false } as never);
    render(<Probe />);
    expect(read()).toBe("no");
  });

  it("is true when the instance reports the capability", () => {
    setInstanceFeaturesForTests({ live: true } as never);
    render(<Probe />);
    expect(read()).toBe("yes");
  });

  // Unknown is NOT off, mirroring useMessagingAvailable: hiding live from every
  // instance that never turned it off would be a worse bug than the refusal
  // this prevents.
  it("stays available for a core that does not disclose the flag", () => {
    setInstanceFeaturesForTests({ uploads: true } as never);
    render(<Probe />);
    expect(read()).toBe("yes");
  });

  it("stays available before the shared instance fetch lands", () => {
    setInstanceFeaturesForTests(null);
    render(<Probe />);
    expect(read()).toBe("yes");
  });
});
