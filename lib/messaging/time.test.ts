import { describe, expect, it } from "vitest";

import { sameDay, separatorLabel } from "./time";

// All dates are constructed with the LOCAL Date constructor and read back with
// local getters, so these assertions hold regardless of the runner's timezone.
const NOW = new Date(2026, 6, 7, 14, 30); // Tue 7 Jul 2026, 14:30 local
const iso = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo, d, h, mi).toISOString();

describe("separatorLabel", () => {
  it("labels the same day as Today · HH:MM", () => {
    expect(separatorLabel(iso(2026, 6, 7, 9, 5), NOW)).toBe("Today · 09:05");
  });

  it("labels the previous day as Yesterday · HH:MM", () => {
    expect(separatorLabel(iso(2026, 6, 6, 18, 0), NOW)).toBe("Yesterday · 18:00");
  });

  it("labels within the last week as Weekday · HH:MM", () => {
    // 3 Jul 2026 is a Friday, 4 days before the 7th (< 7 → weekday form).
    expect(separatorLabel(iso(2026, 6, 3, 14, 2), NOW)).toBe("Fri · 14:02");
  });

  it("labels earlier this year as D Mon · HH:MM", () => {
    expect(separatorLabel(iso(2026, 5, 20, 8, 9), NOW)).toBe("20 Jun · 08:09");
  });

  it("labels a prior year with the year included", () => {
    expect(separatorLabel(iso(2025, 6, 3, 14, 2), NOW)).toBe("3 Jul 2025 · 14:02");
  });

  it("returns empty for an invalid date", () => {
    expect(separatorLabel("not-a-date", NOW)).toBe("");
  });
});

describe("sameDay", () => {
  it("is true across times on the same calendar day", () => {
    expect(sameDay(iso(2026, 6, 7, 0, 1), iso(2026, 6, 7, 23, 59))).toBe(true);
  });

  it("is false across a day boundary", () => {
    expect(sameDay(iso(2026, 6, 7, 23, 59), iso(2026, 6, 8, 0, 1))).toBe(false);
  });
});
