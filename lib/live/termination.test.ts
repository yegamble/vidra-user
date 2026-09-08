import { describe, expect, it } from "vitest";

import type { LiveTermination } from "@/lib/api";

import {
  TERMINATION_REASONS,
  terminationHeadline,
  terminationReasonLabel,
} from "./termination";

const at = "2026-09-08T12:00:00Z";

describe("terminationReasonLabel", () => {
  it("gives every code core accepts a sentence a creator can read", () => {
    for (const code of TERMINATION_REASONS) {
      const label = terminationReasonLabel(code);
      expect(label, `no label for ${code}`).not.toBe("");
      // A label that is still the raw token means the map fell through, which is
      // exactly what this test exists to catch when core adds a code.
      expect(label, `${code} renders as its own database value`).not.toBe(code);
    }
  });

  it("falls back to the code rather than to nothing for an unknown one", () => {
    // An older or newer core is a real possibility, and a blank tells the
    // creator less than a raw token does.
    expect(terminationReasonLabel("from_the_future")).toBe("from_the_future");
    expect(terminationReasonLabel(undefined)).toBe("");
  });
});

describe("terminationHeadline", () => {
  it("names the reason for a moderator termination", () => {
    const t: LiveTermination = {
      terminated_at: at,
      by_moderator: true,
      reason_code: "copyright",
    };
    expect(terminationHeadline(t)).toBe(
      "This stream was ended by a moderator: Copyright claim.",
    );
  });

  it("does not accuse a creator who ended their own stream", () => {
    const t: LiveTermination = { terminated_at: at, by_moderator: false };
    expect(terminationHeadline(t)).toBe("You ended this stream.");
    expect(terminationHeadline(t)).not.toContain("moderator");
  });

  it("still says what happened when a moderator termination carries no code", () => {
    const t: LiveTermination = { terminated_at: at, by_moderator: true };
    expect(terminationHeadline(t)).toBe("This stream was ended by a moderator.");
  });
});
