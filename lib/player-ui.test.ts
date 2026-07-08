import { describe, expect, it } from "vitest";

import {
  bufferedBands,
  clamp,
  clampBubbleLeft,
  fractionAt,
  fractionOfTime,
  seekValueText,
  stepVolume,
  timeAtFraction,
  volumePercent,
} from "./player-ui";

describe("clamp", () => {
  it("restricts to the bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("fractionAt", () => {
  it("maps clientX to a 0..1 fraction of the track", () => {
    expect(fractionAt(50, 0, 100)).toBe(0.5);
    expect(fractionAt(0, 0, 100)).toBe(0);
    expect(fractionAt(100, 0, 100)).toBe(1);
  });

  it("clamps outside the track and offsets by the track's left edge", () => {
    expect(fractionAt(-20, 0, 100)).toBe(0);
    expect(fractionAt(200, 0, 100)).toBe(1);
    expect(fractionAt(60, 40, 100)).toBe(0.2); // (60-40)/100
  });

  it("returns 0 for an unlaid-out (zero-width) track", () => {
    expect(fractionAt(50, 0, 0)).toBe(0);
  });
});

describe("timeAtFraction / fractionOfTime", () => {
  it("round-trips a fraction through a duration", () => {
    expect(timeAtFraction(0.25, 200)).toBe(50);
    expect(fractionOfTime(50, 200)).toBe(0.25);
  });

  it("guards a zero/unknown duration", () => {
    expect(timeAtFraction(0.5, 0)).toBe(0);
    expect(fractionOfTime(10, 0)).toBe(0);
    expect(timeAtFraction(0.5, Number.NaN)).toBe(0);
  });

  it("clamps out-of-range inputs", () => {
    expect(timeAtFraction(2, 100)).toBe(100);
    expect(fractionOfTime(500, 100)).toBe(1);
  });
});

describe("bufferedBands", () => {
  it("maps [start,end] ranges to 0..1 left+width bands", () => {
    expect(bufferedBands([[0, 30]], 120)).toEqual([{ left: 0, width: 0.25 }]);
    expect(bufferedBands([[30, 60], [90, 120]], 120)).toEqual([
      { left: 0.25, width: 0.25 },
      { left: 0.75, width: 0.25 },
    ]);
  });

  it("clamps ranges to the duration and drops degenerate/empty ones", () => {
    expect(bufferedBands([[-10, 60]], 120)).toEqual([{ left: 0, width: 0.5 }]);
    expect(bufferedBands([[100, 200]], 120)).toEqual([{ left: 100 / 120, width: 20 / 120 }]);
    expect(bufferedBands([[50, 50]], 120)).toEqual([]);
  });

  it("yields nothing when the duration is unknown", () => {
    expect(bufferedBands([[0, 30]], 0)).toEqual([]);
    expect(bufferedBands([[0, 30]], Number.NaN)).toEqual([]);
  });
});

describe("seekValueText", () => {
  it("reads 'elapsed of total'", () => {
    expect(seekValueText(83, 760)).toBe("1:23 of 12:40");
    expect(seekValueText(0, 65)).toBe("0:00 of 1:05");
  });

  it("collapses to just the elapsed time when the duration is unknown", () => {
    expect(seekValueText(83, 0)).toBe("1:23");
    expect(seekValueText(83, Number.NaN)).toBe("1:23");
  });

  it("appends the chapter title after an em dash when the playhead is in a chapter", () => {
    expect(seekValueText(192, 760, "Intro")).toBe("3:12 of 12:40 — Intro");
    // A blank/absent title is ignored — no trailing dash.
    expect(seekValueText(192, 760, null)).toBe("3:12 of 12:40");
    expect(seekValueText(192, 760, "  ")).toBe("3:12 of 12:40");
    // Works with an unknown duration too.
    expect(seekValueText(83, 0, "Setup")).toBe("1:23 — Setup");
  });
});

describe("stepVolume", () => {
  it("nudges by a percentage of the full range, clamped and rounded", () => {
    expect(stepVolume(0.5, 5)).toBe(0.55);
    expect(stepVolume(0.5, -5)).toBe(0.45);
    expect(stepVolume(0.98, 5)).toBe(1);
    expect(stepVolume(0.02, -5)).toBe(0);
  });
});

describe("volumePercent", () => {
  it("scales the level to whole percent", () => {
    expect(volumePercent(0.5, false)).toBe(50);
    expect(volumePercent(1, false)).toBe(100);
  });

  it("reads 0 while muted regardless of the underlying level", () => {
    expect(volumePercent(0.8, true)).toBe(0);
  });
});

describe("clampBubbleLeft", () => {
  it("centres the bubble on the pointer well inside the track", () => {
    // 50% of 400 = 200; a 160px bubble has 120px of slack on each side.
    expect(clampBubbleLeft(0.5, 400, 160)).toBe(200);
  });

  it("shifts the bubble in so neither edge is clipped near the ends", () => {
    // At the very start/end a 160px bubble (half = 80) is pinned to [80, 320].
    expect(clampBubbleLeft(0, 400, 160)).toBe(80);
    expect(clampBubbleLeft(1, 400, 160)).toBe(320);
  });

  it("centres on the pointer when the bubble cannot fit / the track is unmeasured", () => {
    expect(clampBubbleLeft(0.25, 100, 160)).toBe(25); // wider than the track → no clamp
    expect(clampBubbleLeft(0.5, 0, 160)).toBe(0); // unmeasured track
  });
});
