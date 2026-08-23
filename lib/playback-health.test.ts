import { describe, expect, it } from "vitest";

import {
  bucketReportsRenditions,
  DELIVERY_SOURCE_LABEL,
  ENGINE_LABEL,
  errorClassLabel,
  formatApproxMs,
  formatRebufferRate,
  formatShare,
  hasUnreportableEngine,
  PACKAGING_FORMAT_LABEL,
  reportsRenditions,
  summarizeErrorCounts,
  windowSince,
} from "./playback-health";

describe("formatApproxMs", () => {
  it("rounds to the precision a 15%-bucket histogram actually has", () => {
    // Two significant figures, never four: the underlying value is somewhere
    // inside a bucket, so "1,237 ms" would be confidence the data lacks.
    expect(formatApproxMs(1237)).toBe("1.2 s");
    expect(formatApproxMs(87)).toBe("87 ms");
    expect(formatApproxMs(943)).toBe("940 ms");
    expect(formatApproxMs(12_345)).toBe("12 s");
    expect(formatApproxMs(123_456)).toBe("120 s");
  });

  it("carries small values up into seconds rather than printing 1000 ms", () => {
    expect(formatApproxMs(999)).toBe("1 s");
  });

  it("renders a missing measurement as a dash, never as zero", () => {
    // 0 ms of rebuffering is the number an operator reads as perfect delivery,
    // so "nothing was measured" must not look like it.
    expect(formatApproxMs(null)).toBe("—");
    expect(formatApproxMs(undefined)).toBe("—");
    expect(formatApproxMs(0)).toBe("0 ms");
  });

  it("does not leak floating-point noise", () => {
    expect(formatApproxMs(3_456)).toBe("3.5 s");
    expect(formatApproxMs(5)).toBe("5 ms");
  });
});

describe("formatShare", () => {
  it("is a dash when the whole is zero, because 0/0 is unknown and not 0%", () => {
    expect(formatShare(0, 0)).toBe("—");
    expect(formatShare(undefined, undefined)).toBe("—");
  });

  it("reports an unattested window as 0%, which is the normal reading", () => {
    expect(formatShare(0, 412)).toBe("0%");
    expect(formatShare(206, 412)).toBe("50%");
  });
});

describe("formatRebufferRate", () => {
  it("divides stalls by playbacks and refuses to divide by nothing", () => {
    expect(formatRebufferRate(6, 120)).toBe("0.05");
    expect(formatRebufferRate(0, 120)).toBe("0.00");
    expect(formatRebufferRate(3, 0)).toBe("—");
  });
});

describe("rendition reporting", () => {
  it("is permanently unavailable on native HLS and available elsewhere", () => {
    expect(reportsRenditions("native-hls")).toBe(false);
    expect(reportsRenditions("hls-js")).toBe(true);
    expect(reportsRenditions("progressive")).toBe(true);
    expect(reportsRenditions("shaka")).toBe(true);
  });

  it("flags a merged row that any native-HLS session contributed to", () => {
    expect(hasUnreportableEngine(["hls-js", "native-hls"])).toBe(true);
    expect(hasUnreportableEngine(["hls-js", "progressive"])).toBe(false);
    expect(hasUnreportableEngine(undefined)).toBe(false);
  });

  it("prefers the server's own per-bucket flag over the engine guess", () => {
    expect(
      bucketReportsRenditions({ engine: "hls-js", rendition_reporting_supported: false }),
    ).toBe(false);
    expect(
      bucketReportsRenditions({ engine: "native-hls", rendition_reporting_supported: true }),
    ).toBe(true);
  });

  it("falls back to the engine when a server sends no flag", () => {
    expect(bucketReportsRenditions({ engine: "native-hls" })).toBe(false);
    expect(bucketReportsRenditions({ engine: "hls-js" })).toBe(true);
    // No engine to judge is not grounds to accuse one of a capability gap.
    expect(bucketReportsRenditions({})).toBe(true);
  });
});

describe("summarizeErrorCounts", () => {
  it("orders heaviest first and drops empty classes", () => {
    expect(summarizeErrorCounts({ network: 4, timeout: 1, media: 0 })).toBe(
      "network 4 · timeout 1",
    );
  });

  it("is empty when nothing failed", () => {
    expect(summarizeErrorCounts({})).toBe("");
    expect(summarizeErrorCounts(undefined)).toBe("");
  });

  it("humanises a class this client has never heard of instead of hiding it", () => {
    expect(errorClassLabel("network")).toBe("network");
    expect(errorClassLabel("licence_denied")).toBe("licence denied");
  });
});

describe("vocabulary labels", () => {
  it("names every member of each closed vocabulary", () => {
    // Exhaustive Records: a member added core-side is a compile error here, so
    // this only guards against an empty string sneaking in.
    for (const label of Object.values(DELIVERY_SOURCE_LABEL)) expect(label).not.toBe("");
    for (const label of Object.values(ENGINE_LABEL)) expect(label).not.toBe("");
    for (const label of Object.values(PACKAGING_FORMAT_LABEL)) expect(label).not.toBe("");
  });
});

describe("windowSince", () => {
  const now = new Date("2026-08-23T14:37:00.000Z");

  it("sends nothing for the default window, so the exit criterion stays a bare GET", () => {
    expect(windowSince(24, now)).toBeUndefined();
  });

  it("computes a start for the wider windows", () => {
    expect(windowSince(72, now)).toBe("2026-08-20T14:37:00.000Z");
    expect(windowSince(168, now)).toBe("2026-08-16T14:37:00.000Z");
  });
});
