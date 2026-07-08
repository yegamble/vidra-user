import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatCount,
  formatDateTime,
  formatDuration,
  formatMonthYear,
  formatUptime,
  relativeTime,
} from "./format";

describe("formatCount", () => {
  it("formats small, thousands, millions, billions", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(942)).toBe("942");
    expect(formatCount(1000)).toBe("1K");
    expect(formatCount(1200)).toBe("1.2K");
    expect(formatCount(15500)).toBe("15.5K");
    expect(formatCount(120000)).toBe("120K");
    expect(formatCount(3_400_000)).toBe("3.4M");
    expect(formatCount(1_000_000_000)).toBe("1B");
  });

  it("guards against negatives / NaN", () => {
    expect(formatCount(-5)).toBe("0");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB, MB, GB (1024-step)", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");
  });

  it("guards against negatives / NaN", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-06-20T12:00:00Z");
  const ago = (secs: number) => new Date(now.getTime() - secs * 1000).toISOString();

  it("renders coarse buckets", () => {
    expect(relativeTime(ago(2), now)).toBe("just now");
    expect(relativeTime(ago(45), now)).toBe("45s ago");
    expect(relativeTime(ago(120), now)).toBe("2m ago");
    expect(relativeTime(ago(7200), now)).toBe("2h ago");
    expect(relativeTime(ago(2 * 86400), now)).toBe("2d ago");
    expect(relativeTime(ago(3 * 604800), now)).toBe("3w ago");
    expect(relativeTime(ago(2 * 2629800), now)).toBe("2mo ago");
    expect(relativeTime(ago(2 * 31557600), now)).toBe("2y ago");
  });

  it("handles future and invalid input", () => {
    expect(relativeTime(ago(-30), now)).toBe("just now");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("formatUptime", () => {
  it("formats day/hour/minute buckets, dropping empty units", () => {
    expect(formatUptime(0)).toBe("0m");
    expect(formatUptime(59)).toBe("0m");
    expect(formatUptime(60)).toBe("1m");
    expect(formatUptime(3600)).toBe("1h");
    expect(formatUptime(3661)).toBe("1h 1m");
    expect(formatUptime(90061)).toBe("1d 1h 1m");
    expect(formatUptime(86400 * 3)).toBe("3d");
  });

  it("guards against negative / NaN", () => {
    expect(formatUptime(-5)).toBe("0m");
    expect(formatUptime(Number.NaN)).toBe("0m");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes, and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(83)).toBe("1:23");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("guards against negative / NaN", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});

describe("formatDateTime", () => {
  it("renders a locale-formatted absolute date + time", () => {
    const out = formatDateTime("2026-07-10T14:30:00Z");
    // Locale/zone dependent, so assert the stable parts: the year and a time.
    expect(out).toContain("2026");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns empty for an unparseable timestamp", () => {
    expect(formatDateTime("not-a-date")).toBe("");
  });
});

describe("formatMonthYear", () => {
  it("renders a locale-formatted month + year with no day precision", () => {
    const out = formatMonthYear("2026-07-10T14:30:00Z");
    // Locale-dependent, so assert the stable parts: the year and no day number.
    expect(out).toContain("2026");
    expect(out).not.toMatch(/\b10\b/);
  });

  it("returns empty for an unparseable timestamp", () => {
    expect(formatMonthYear("not-a-date")).toBe("");
  });
});
