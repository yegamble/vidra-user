// Pure helpers for the watch player's seek-preview storyboard: parse a WebVTT
// storyboard map into cues and look up the cue covering a given playback time.
//
// A storyboard WebVTT maps time ranges to rectangles of a single sprite sheet
// via the media-fragment `#xywh=` syntax, e.g.
//
//   WEBVTT
//
//   00:00:00.000 --> 00:00:02.000
//   storyboard.jpg#xywh=0,0,160,90
//
//   00:00:02.000 --> 00:00:04.000
//   storyboard.jpg#xywh=160,0,160,90
//
// We only need each cue's time span and sprite rectangle; the image path in the
// cue is ignored (the sprite URL is resolved from the video id by the caller).

/** One storyboard cue: a time span mapped to a rectangle of the sprite sheet. */
export interface StoryboardCue {
  /** Cue start time, in seconds. */
  start: number;
  /** Cue end time, in seconds. */
  end: number;
  /** Sprite rectangle, in image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * parseVttTimestamp parses a WebVTT timestamp (`HH:MM:SS.mmm` or `MM:SS.mmm`)
 * into seconds. Returns NaN for anything unparseable.
 */
export function parseVttTimestamp(ts: string): number {
  const m = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return NaN;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

// Parse a cue payload line's `#xywh=x,y,w,h` fragment into a rectangle.
function parseXywh(payload: string): { x: number; y: number; w: number; h: number } | null {
  const m = payload.match(/#xywh=(?:pixel:)?(\d+),(\d+),(\d+),(\d+)/);
  if (!m) return null;
  const [, x, y, w, h] = m;
  return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
}

/**
 * parseStoryboardVtt parses a storyboard WebVTT document into ordered cues.
 * Malformed cues (bad timing line, missing `#xywh=`) are skipped; the result is
 * sorted by start time so lookups can assume ascending order.
 */
export function parseStoryboardVtt(vtt: string): StoryboardCue[] {
  const cues: StoryboardCue[] = [];
  // Normalise line endings, then split into blocks on blank lines.
  const blocks = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (lines.length === 0) continue;
    // Find the timing line ("start --> end"); a cue may carry an id line above it.
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx === -1) continue;
    const timing = lines[timingIdx];
    const payload = lines[timingIdx + 1];
    if (!payload) continue;
    const [startRaw, endRaw] = timing.split("-->");
    if (!startRaw || !endRaw) continue;
    // The end side may carry cue settings after the timestamp; keep the first token.
    const start = parseVttTimestamp(startRaw);
    const end = parseVttTimestamp(endRaw.trim().split(/\s+/)[0]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const rect = parseXywh(payload);
    if (!rect) continue;
    cues.push({ start, end, ...rect });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/**
 * cueAt returns the storyboard cue covering `timeSeconds` — the last cue whose
 * start is at or before the time (cue spans are contiguous). Returns null when
 * there are no cues or the time precedes the first cue.
 */
export function cueAt(cues: StoryboardCue[], timeSeconds: number): StoryboardCue | null {
  if (cues.length === 0) return null;
  const t = Math.max(0, timeSeconds);
  let found: StoryboardCue | null = null;
  for (const cue of cues) {
    if (cue.start <= t) found = cue;
    else break;
  }
  // Before the first cue, clamp to the first (so scrubbing to 0 still previews).
  return found ?? cues[0];
}
