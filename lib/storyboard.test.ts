import { describe, expect, it } from "vitest";

import { cueAt, parseStoryboardVtt, parseVttTimestamp } from "./storyboard";

describe("parseVttTimestamp", () => {
  it("parses HH:MM:SS.mmm into seconds", () => {
    expect(parseVttTimestamp("00:00:00.000")).toBe(0);
    expect(parseVttTimestamp("00:00:02.500")).toBe(2.5);
    expect(parseVttTimestamp("01:02:03.004")).toBeCloseTo(3723.004, 3);
  });

  it("parses MM:SS.mmm (no hours) and bare MM:SS", () => {
    expect(parseVttTimestamp("02:30.000")).toBe(150);
    expect(parseVttTimestamp("00:05")).toBe(5);
  });

  it("returns NaN for garbage", () => {
    expect(Number.isNaN(parseVttTimestamp("not-a-time"))).toBe(true);
    expect(Number.isNaN(parseVttTimestamp(""))).toBe(true);
  });
});

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
storyboard.jpg#xywh=0,0,160,90

00:00:02.000 --> 00:00:04.000
storyboard.jpg#xywh=160,0,160,90

00:00:04.000 --> 00:00:06.000
storyboard.jpg#xywh=320,0,160,90
`;

describe("parseStoryboardVtt", () => {
  it("parses each cue's time span and sprite rectangle", () => {
    const cues = parseStoryboardVtt(VTT);
    expect(cues).toHaveLength(3);
    expect(cues[0]).toEqual({ start: 0, end: 2, x: 0, y: 0, w: 160, h: 90 });
    expect(cues[1]).toEqual({ start: 2, end: 4, x: 160, y: 0, w: 160, h: 90 });
    expect(cues[2]).toEqual({ start: 4, end: 6, x: 320, y: 0, w: 160, h: 90 });
  });

  it("tolerates CRLF line endings and cue id lines", () => {
    const withIds = "WEBVTT\r\n\r\n1\r\n00:00:00.000 --> 00:00:01.000\r\nsb.jpg#xywh=0,0,80,45\r\n";
    const cues = parseStoryboardVtt(withIds);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toEqual({ start: 0, end: 1, x: 0, y: 0, w: 80, h: 45 });
  });

  it("skips malformed cues (missing xywh or bad timing) and sorts by start", () => {
    const messy = `WEBVTT

00:00:04.000 --> 00:00:06.000
sb.jpg#xywh=320,0,160,90

00:00:00.000 --> 00:00:02.000
sb.jpg#xywh=0,0,160,90

00:00:02.000 --> 00:00:04.000
sb.jpg
`;
    const cues = parseStoryboardVtt(messy);
    // The middle cue has no #xywh and is dropped; the rest sort ascending.
    expect(cues.map((c) => c.start)).toEqual([0, 4]);
  });

  it("returns [] for an empty or header-only document", () => {
    expect(parseStoryboardVtt("")).toEqual([]);
    expect(parseStoryboardVtt("WEBVTT\n")).toEqual([]);
  });
});

describe("cueAt", () => {
  const cues = parseStoryboardVtt(VTT);

  it("returns the cue covering a time", () => {
    expect(cueAt(cues, 0)).toEqual(cues[0]);
    expect(cueAt(cues, 1.9)).toEqual(cues[0]);
    expect(cueAt(cues, 2)).toEqual(cues[1]);
    expect(cueAt(cues, 5)).toEqual(cues[2]);
  });

  it("clamps a time past the last cue to the last cue", () => {
    expect(cueAt(cues, 999)).toEqual(cues[2]);
  });

  it("clamps a negative time to the first cue", () => {
    expect(cueAt(cues, -5)).toEqual(cues[0]);
  });

  it("returns null when there are no cues", () => {
    expect(cueAt([], 3)).toBeNull();
  });
});
