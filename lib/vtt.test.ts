import { describe, expect, it } from "vitest";

import {
  cueIssues,
  formatVttTime,
  parseVtt,
  parseVttTime,
  serializeVtt,
  type VttCue,
} from "@/lib/vtt";

const SAMPLE = `WEBVTT - Title line

NOTE
This is a note
spanning two lines

STYLE
::cue { color: red }

intro
00:01.000 --> 00:03.500 align:start position:10%
Hello &amp; welcome
second <b>line</b> with a &lt;tag&gt;

00:04.000 --> 01:00:05.250
No identifier
`;

describe("vtt time", () => {
  it("parses mm:ss.mmm and hh:mm:ss.mmm", () => {
    expect(parseVttTime("01:02.003")).toBe(62_003);
    expect(parseVttTime("1:02:03.004")).toBe(3_723_004);
    expect(parseVttTime("00:00.5")).toBe(500);
  });
  it("rejects malformed times", () => {
    expect(parseVttTime("")).toBeNull();
    expect(parseVttTime("-1:00.000")).toBeNull();
    expect(parseVttTime("1:75.000")).toBeNull();
    expect(parseVttTime("abc")).toBeNull();
    expect(parseVttTime("12")).toBeNull();
  });
  it("formats with hours only when needed", () => {
    expect(formatVttTime(62_003)).toBe("01:02.003");
    expect(formatVttTime(3_723_004)).toBe("01:02:03.004");
  });
});

describe("parseVtt / serializeVtt", () => {
  it("round-trips a document byte for byte", () => {
    expect(serializeVtt(parseVtt(SAMPLE))).toBe(SAMPLE);
  });

  it("parses cues with ids, settings, multi-line text and raw escapes", () => {
    const doc = parseVtt(SAMPLE);
    const cues = doc.blocks.filter((b): b is VttCue => b.kind === "cue");
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      id: "intro",
      startMs: 1000,
      endMs: 3500,
      settings: "align:start position:10%",
      text: "Hello &amp; welcome\nsecond <b>line</b> with a &lt;tag&gt;",
    });
    expect(cues[1].id).toBe("");
    expect(cues[1].endMs).toBe(3_605_250);
    expect(doc.header).toBe("WEBVTT - Title line");
  });

  it("keeps NOTE and STYLE blocks in position", () => {
    const doc = parseVtt(SAMPLE);
    expect(doc.blocks.map((b) => b.kind)).toEqual(["raw", "raw", "cue", "cue"]);
  });

  it("round-trips an edited cue and normalises CRLF and BOM", () => {
    const doc = parseVtt("﻿WEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHi\r\n");
    const cue = doc.blocks[0] as VttCue;
    cue.text = "Bye";
    expect(serializeVtt(doc)).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nBye\n");
  });

  it("serialises a header-only document and strips blank lines from cue text", () => {
    expect(serializeVtt(parseVtt("WEBVTT\n"))).toBe("WEBVTT\n");
    const doc = parseVtt("WEBVTT\n\n00:00.000 --> 00:01.000\nA\n");
    (doc.blocks[0] as VttCue).text = "A\n\n  \nB";
    expect(serializeVtt(doc)).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nA\nB\n");
  });

  it("refuses to serialise cue text containing -->", () => {
    const doc = parseVtt("WEBVTT\n\n00:00.000 --> 00:01.000\nA\n");
    (doc.blocks[0] as VttCue).text = "a --> b";
    expect(() => serializeVtt(doc)).toThrow(/-->/);
  });

  it("rejects input without a WEBVTT header", () => {
    expect(() => parseVtt("00:00.000 --> 00:01.000\nHi")).toThrow(/WEBVTT/);
  });

  it("tolerates a malformed timing block by keeping it raw", () => {
    const src = "WEBVTT\n\n00:00.000 --> nonsense\nHi\n";
    const doc = parseVtt(src);
    expect(doc.blocks[0].kind).toBe("raw");
    expect(serializeVtt(doc)).toBe(src);
  });

  it("handles a cue with a timing line and no text", () => {
    const src = "WEBVTT\n\n00:00.000 --> 00:01.000\n";
    expect(serializeVtt(parseVtt(src))).toBe(src);
  });
});

describe("cueIssues", () => {
  const cue = (startMs: number, endMs: number, text = "x"): VttCue => ({
    kind: "cue",
    key: "k",
    id: "",
    startMs,
    endMs,
    settings: "",
    text,
  });
  it("flags start >= end as an error", () => {
    const issues = cueIssues([cue(2000, 2000)]);
    expect(issues[0].error).toMatch(/before the end/i);
  });
  it("flags negative times and empty text", () => {
    expect(cueIssues([cue(-1, 10)])[0].error).toMatch(/negative/i);
    expect(cueIssues([cue(0, 10, "  ")])[0].error).toMatch(/text/i);
  });
  it("flags a text containing the cue arrow", () => {
    expect(cueIssues([cue(0, 10, "a --> b")])[0].error).toMatch(/-->/);
  });
  it("warns on overlap with the previous cue without erroring", () => {
    const issues = cueIssues([cue(0, 2000), cue(1500, 3000), cue(3000, 4000)]);
    expect(issues[1].warning).toMatch(/overlap/i);
    expect(issues[1].error).toBeUndefined();
    expect(issues[2].warning).toBeUndefined();
  });
});
