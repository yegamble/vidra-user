import { describe, expect, it } from "vitest";

import {
  FINISHED_FRACTION,
  RESUME_MIN_SECONDS,
  isFinished,
  resumeFraction,
} from "./resume-progress";

describe("resumeFraction", () => {
  it("returns the watched fraction for a real mid-watch position", () => {
    expect(resumeFraction(30, 100)).toBe(0.3);
    expect(resumeFraction(45, 90)).toBe(0.5);
  });

  it("returns null below the RESUME_MIN_SECONDS floor", () => {
    expect(resumeFraction(RESUME_MIN_SECONDS - 1, 100)).toBeNull();
    expect(resumeFraction(0, 100)).toBeNull();
    // Exactly at the floor is allowed (it is a resume, not a trivial position).
    expect(resumeFraction(RESUME_MIN_SECONDS, 100)).toBe(0.05);
  });

  it("returns null at or above the finished threshold (~95%)", () => {
    expect(resumeFraction(95, 100)).toBeNull(); // exactly FINISHED_FRACTION
    expect(resumeFraction(96, 100)).toBeNull();
    expect(resumeFraction(100, 100)).toBeNull();
    // Just under the ceiling still shows a bar.
    expect(resumeFraction(94, 100)).toBeCloseTo(0.94);
  });

  it("returns null when the duration is unknown or non-positive", () => {
    expect(resumeFraction(30, undefined)).toBeNull();
    expect(resumeFraction(30, null)).toBeNull();
    expect(resumeFraction(30, 0)).toBeNull();
    expect(resumeFraction(30, -5)).toBeNull();
  });

  it("returns null when the position is missing", () => {
    expect(resumeFraction(undefined, 100)).toBeNull();
    expect(resumeFraction(null, 100)).toBeNull();
  });
});

describe("isFinished", () => {
  it("is true only at or above the finished threshold of a known duration", () => {
    expect(isFinished(95, 100)).toBe(true);
    expect(isFinished(100, 100)).toBe(true);
    expect(isFinished(94, 100)).toBe(false);
    expect(isFinished(0, 100)).toBe(false);
  });

  it("is false when the duration is unknown or non-positive", () => {
    expect(isFinished(100, undefined)).toBe(false);
    expect(isFinished(100, 0)).toBe(false);
    // A below-floor-but-not-finished position with unknown duration is NOT
    // finished — it stays resumable (distinct from resumeFraction === null).
    expect(isFinished(2, undefined)).toBe(false);
  });

  it("uses the documented threshold constant", () => {
    expect(FINISHED_FRACTION).toBe(0.95);
  });
});
