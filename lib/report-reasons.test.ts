import { describe, expect, it } from "vitest";

import { formatReportRange, parseTimestamp, reasonLabel } from "./report-reasons";

describe("parseTimestamp", () => {
  it("reads seconds, m:ss and h:mm:ss", () => {
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp(" 1:30 ")).toBe(90);
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "-5", "1.5", "a", "1:2:3:4", "1:"]) expect(parseTimestamp(bad)).toBeNull();
  });
});

describe("report range and reason labels", () => {
  it("formats a moment and a range", () => {
    expect(formatReportRange(75)).toBe("1:15");
    expect(formatReportRange(75, 90)).toBe("1:15–1:30");
  });
  it("falls back to the raw value for an unknown reason", () => {
    expect(reasonLabel("privacy")).toBe("Privacy");
    expect(reasonLabel("future")).toBe("future");
  });
});
