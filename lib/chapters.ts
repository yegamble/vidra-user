// Pure helpers for seek-bar chapters (CORE-15): a lookup of the chapter covering
// a playback time (for the seek tooltip + the current-chapter readout), an editor
// "m:ss" ⇆ seconds parse/format pair, and a client-side validator that mirrors the
// PUT /videos/{id}/chapters contract so the studio editor catches mistakes before
// the round trip. No React, no I/O — trivially unit-testable.

import type { VideoChapter } from "@/lib/api";
import { formatDuration } from "@/lib/format";

/** The contract's caps (mirrored so the editor blocks before the 400). */
export const MAX_CHAPTERS = 100;
export const MAX_TITLE_LENGTH = 120;

/**
 * chapterAt returns the chapter covering `timeSeconds` — the last chapter whose
 * start is at or before the time (the API guarantees ascending, non-overlapping
 * starts). Returns null when there are no chapters, or before the first chapter's
 * start (an unlabelled head is honest: we do not pretend the first chapter covers
 * time it does not).
 */
export function chapterAt(chapters: readonly VideoChapter[], timeSeconds: number): VideoChapter | null {
  if (chapters.length === 0) return null;
  const t = Math.max(0, timeSeconds);
  let found: VideoChapter | null = null;
  for (const c of chapters) {
    if (c.start_seconds <= t) found = c;
    else break; // ascending → nothing further can match
  }
  return found;
}

/**
 * parseChapterStart parses an editor start value into whole seconds, or null when
 * unparseable / negative. Accepts plain integer seconds ("90"), "m:ss" ("1:30",
 * minutes unbounded), or "h:mm:ss" ("1:02:03", minutes 0–59). Seconds are always
 * 0–59.
 */
export function parseChapterStart(input: string): number | null {
  const s = input.trim();
  if (s === "") return null;
  if (/^\d+$/.test(s)) return Number(s); // plain seconds
  const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const mins = Number(m[2]);
  const secs = Number(m[3]);
  if (secs > 59) return null;
  if (m[1] && mins > 59) return null; // with an hours group, minutes must be 0–59
  return hours * 3600 + mins * 60 + secs;
}

/** formatChapterStart renders whole seconds as the editor's m:ss / h:mm:ss form. */
export function formatChapterStart(seconds: number): string {
  return formatDuration(seconds);
}

/** One editor row before it is parsed/validated. */
export interface ChapterDraft {
  start: string;
  title: string;
}

/** A per-row validation problem, keyed to the row index + which field it targets. */
export interface ChapterValidationError {
  index: number;
  field: "start" | "title";
  message: string;
}

export interface ChapterValidationResult {
  valid: boolean;
  errors: ChapterValidationError[];
  /** The parsed set to PUT, meaningful only when `valid` is true. */
  chapters: VideoChapter[];
}

/**
 * validateChapters mirrors the PUT /videos/{id}/chapters contract client-side:
 * each start parses to >= 0 and is strictly increasing down the list; each start
 * is < the duration when it is known; each title is 1–120 characters after
 * trimming; at most 100 rows. Returns the parsed payload plus any per-row errors
 * (empty ⇒ valid). An empty draft list is valid and yields an empty set (which
 * clears all chapters — the contract's documented behaviour).
 */
export function validateChapters(
  drafts: readonly ChapterDraft[],
  durationSeconds?: number,
): ChapterValidationResult {
  const errors: ChapterValidationError[] = [];
  const chapters: VideoChapter[] = [];
  const hasDuration =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0;
  let prevStart: number | null = null;

  drafts.forEach((d, i) => {
    const start = parseChapterStart(d.start);
    const title = d.title.trim();

    if (start === null || start < 0) {
      errors.push({ index: i, field: "start", message: "Enter a time like 1:30." });
    } else {
      if (prevStart !== null && start <= prevStart) {
        errors.push({ index: i, field: "start", message: "Times must increase down the list." });
      }
      if (hasDuration && start >= (durationSeconds as number)) {
        errors.push({ index: i, field: "start", message: "Must be before the video ends." });
      }
      prevStart = start;
    }

    if (title === "") {
      errors.push({ index: i, field: "title", message: "Add a chapter title." });
    } else if (title.length > MAX_TITLE_LENGTH) {
      errors.push({
        index: i,
        field: "title",
        message: `Keep the title to ${MAX_TITLE_LENGTH} characters or fewer.`,
      });
    }

    if (start !== null && start >= 0 && title !== "" && title.length <= MAX_TITLE_LENGTH) {
      chapters.push({ start_seconds: start, title });
    }
  });

  if (drafts.length > MAX_CHAPTERS) {
    errors.push({
      index: MAX_CHAPTERS,
      field: "start",
      message: `A video can have at most ${MAX_CHAPTERS} chapters.`,
    });
  }

  return { valid: errors.length === 0, errors, chapters };
}
