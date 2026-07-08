import { describe, expect, it } from "vitest";

import {
  chapterAt,
  formatChapterStart,
  parseChapterStart,
  validateChapters,
  MAX_CHAPTERS,
} from "./chapters";
import type { VideoChapter } from "@/lib/api";

const CHAPTERS: VideoChapter[] = [
  { start_seconds: 0, title: "Intro" },
  { start_seconds: 60, title: "The Build" },
  { start_seconds: 180, title: "Wrap up" },
];

describe("chapterAt", () => {
  it("returns null when there are no chapters", () => {
    expect(chapterAt([], 30)).toBeNull();
  });

  it("returns the last chapter whose start is at or before the time", () => {
    expect(chapterAt(CHAPTERS, 0)?.title).toBe("Intro");
    expect(chapterAt(CHAPTERS, 59)?.title).toBe("Intro");
    expect(chapterAt(CHAPTERS, 60)?.title).toBe("The Build");
    expect(chapterAt(CHAPTERS, 179)?.title).toBe("The Build");
    expect(chapterAt(CHAPTERS, 180)?.title).toBe("Wrap up");
    expect(chapterAt(CHAPTERS, 9_999)?.title).toBe("Wrap up");
  });

  it("returns null before the first chapter's start (unlabelled head)", () => {
    const late: VideoChapter[] = [{ start_seconds: 30, title: "Later" }];
    expect(chapterAt(late, 0)).toBeNull();
    expect(chapterAt(late, 29)).toBeNull();
    expect(chapterAt(late, 30)?.title).toBe("Later");
  });

  it("clamps a negative time to the start", () => {
    expect(chapterAt(CHAPTERS, -5)?.title).toBe("Intro");
  });
});

describe("parseChapterStart", () => {
  it("parses plain integer seconds", () => {
    expect(parseChapterStart("0")).toBe(0);
    expect(parseChapterStart("90")).toBe(90);
    expect(parseChapterStart(" 42 ")).toBe(42);
  });

  it("parses m:ss with unbounded minutes", () => {
    expect(parseChapterStart("1:30")).toBe(90);
    expect(parseChapterStart("0:05")).toBe(5);
    expect(parseChapterStart("90:00")).toBe(5400);
  });

  it("parses h:mm:ss", () => {
    expect(parseChapterStart("1:02:03")).toBe(3723);
    expect(parseChapterStart("0:00:30")).toBe(30);
  });

  it("rejects malformed / out-of-range values", () => {
    expect(parseChapterStart("")).toBeNull();
    expect(parseChapterStart("abc")).toBeNull();
    expect(parseChapterStart("1:60")).toBeNull(); // seconds > 59
    expect(parseChapterStart("1:75:00")).toBeNull(); // minutes > 59 with an hours group
    expect(parseChapterStart("1:2:3")).toBeNull(); // mm/ss must be two digits
    expect(parseChapterStart("-5")).toBeNull();
  });
});

describe("formatChapterStart", () => {
  it("renders m:ss / h:mm:ss like the player time readout", () => {
    expect(formatChapterStart(90)).toBe("1:30");
    expect(formatChapterStart(5)).toBe("0:05");
    expect(formatChapterStart(3723)).toBe("1:02:03");
  });
});

describe("validateChapters", () => {
  it("accepts a well-formed, ascending set and returns the parsed payload", () => {
    const res = validateChapters(
      [
        { start: "0:00", title: "Intro" },
        { start: "1:00", title: "The Build" },
        { start: "3:00", title: " Wrap up " },
      ],
      600,
    );
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.chapters).toEqual([
      { start_seconds: 0, title: "Intro" },
      { start_seconds: 60, title: "The Build" },
      { start_seconds: 180, title: "Wrap up" }, // trimmed
    ]);
  });

  it("flags a non-increasing start", () => {
    const res = validateChapters([
      { start: "1:00", title: "A" },
      { start: "1:00", title: "B" },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toContainEqual({
      index: 1,
      field: "start",
      message: "Times must increase down the list.",
    });
  });

  it("flags a start at or past the known duration", () => {
    const res = validateChapters([{ start: "2:00", title: "Too late" }], 90);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toMatchObject({ index: 0, field: "start" });
  });

  it("skips the duration check when the duration is unknown", () => {
    const res = validateChapters([{ start: "9:59", title: "Fine" }]);
    expect(res.valid).toBe(true);
  });

  it("flags an unparseable start and an empty / too-long title", () => {
    const long = "x".repeat(121);
    const res = validateChapters([
      { start: "nope", title: "" },
      { start: "0:10", title: long },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toContainEqual({ index: 0, field: "start", message: "Enter a time like 1:30." });
    expect(res.errors).toContainEqual({ index: 0, field: "title", message: "Add a chapter title." });
    expect(res.errors.some((e) => e.index === 1 && e.field === "title")).toBe(true);
  });

  it("treats an empty draft list as valid and clearing (empty payload)", () => {
    const res = validateChapters([]);
    expect(res.valid).toBe(true);
    expect(res.chapters).toEqual([]);
  });

  it("rejects more than the maximum number of chapters", () => {
    const drafts = Array.from({ length: MAX_CHAPTERS + 1 }, (_, i) => ({
      start: String(i),
      title: `C${i}`,
    }));
    const res = validateChapters(drafts);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes(`at most ${MAX_CHAPTERS}`))).toBe(true);
  });
});
