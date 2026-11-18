import { describe, expect, it } from "vitest";
import { dueBreakSlot } from "./vast-schedule";

const base = { first: 300, interval: 900, duration: 3600, stopAt: null as number | null, lastSlot: -1 };
const at = (time: number, over: Partial<typeof base> = {}) => dueBreakSlot({ ...base, ...over, time });

describe("dueBreakSlot", () => {
  it("has exactly one break when the interval is 0", () => {
    expect(at(299, { interval: 0 })).toBeNull();
    expect(at(300, { interval: 0 })).toBe(0);
    expect(at(3000, { interval: 0 })).toBe(0);
    expect(at(3000, { interval: 0, lastSlot: 0 })).toBeNull();
  });

  it("keeps the single mid-roll's old end rule: any point before the end, none at it", () => {
    expect(at(119, { interval: 0, first: 119, duration: 120 })).toBe(0);
    expect(at(120, { interval: 0, first: 120, duration: 120 })).toBeNull();
  });

  it("repeats at first + k * interval", () => {
    expect(at(299)).toBeNull();
    expect(at(300)).toBe(0);
    expect(at(1199, { lastSlot: 0 })).toBeNull();
    expect(at(1200, { lastSlot: 0 })).toBe(1);
    expect(at(2100, { lastSlot: 1 })).toBe(2);
    expect(at(3000, { lastSlot: 2 })).toBe(3);
  });

  it("yields one slot, the latest, after a seek past several points", () => {
    expect(at(2500)).toBe(2);
    expect(at(2500, { lastSlot: 2 })).toBeNull();
    expect(at(3000, { lastSlot: 2 })).toBe(3);
  });

  it("never replays after a seek back", () => {
    expect(at(400, { lastSlot: 2 })).toBeNull();
    expect(at(1300, { lastSlot: 2 })).toBeNull();
  });

  it("places no repeat in the last 60 seconds", () => {
    // Points 300, 1200, 2100, 3000; 3000 is inside the tail of a 3050 s video.
    expect(at(3040, { duration: 3050, lastSlot: 2 })).toBeNull();
    expect(at(3040, { duration: 3050 })).toBe(2);
    expect(at(3000, { duration: 3060, lastSlot: 2 })).toBe(3);
    expect(at(3000, { duration: 3059.9, lastSlot: 2 })).toBeNull();
    expect(at(100, { first: 100, interval: 60, duration: 150 })).toBeNull();
  });

  it("cuts points at or after the clip stop", () => {
    expect(at(1250, { stopAt: 1200, lastSlot: 0 })).toBeNull();
    expect(at(1199, { stopAt: 1200 })).toBe(0);
    expect(at(1250, { stopAt: 1300, lastSlot: 0 })).toBe(1);
    expect(at(300, { stopAt: 300 })).toBeNull();
    expect(at(30, { first: 30, interval: 0, duration: 120, stopAt: 20 })).toBeNull();
  });

  it("works from a percent-derived first position", () => {
    const first = 3600 * 50 / 100;
    expect(at(1799, { first })).toBeNull();
    expect(at(1800, { first })).toBe(0);
    expect(at(2700, { first, lastSlot: 0 })).toBe(1);
    expect(at(3600, { first: 3600, interval: 0 })).toBeNull();
  });

  it("returns nothing for unknown durations or malformed input", () => {
    expect(at(400, { duration: Number.NaN })).toBeNull();
    expect(at(400, { first: Number.NaN })).toBeNull();
    expect(at(2500, { interval: Number.NaN })).toBe(0);
    expect(at(2500, { interval: -5 })).toBe(0);
  });
});
