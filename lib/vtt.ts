// A small WebVTT reader/writer for the caption cue editor.
//
// Contract: parse -> serialise is lossless for everything the editor does not
// touch. The header line(s), NOTE/STYLE/REGION blocks, cue identifiers and cue
// settings (`align:start position:10%`) all survive a save. Cue TEXT is kept
// verbatim — `&amp;`, `&lt;` and inline tags like `<b>` are part of the cue
// payload and are shown and saved as written, never decoded or re-encoded.
// Whitespace normalisation: CRLF/CR become LF, a BOM is dropped, runs of blank
// lines between blocks collapse to one.

/** An editable cue. `key` is a stable React key that survives reordering. */
export type VttCue = {
  kind: "cue";
  key: string;
  id: string;
  startMs: number;
  endMs: number;
  /** Cue settings after the end timestamp, verbatim ("" when none). */
  settings: string;
  text: string;
};

/** A block the editor leaves alone (NOTE, STYLE, REGION, malformed timing). */
type VttRaw = { kind: "raw"; key: string; text: string };

export type VttBlock = VttCue | VttRaw;

export type VttDocument = {
  /** Everything before the first blank line, starting with "WEBVTT". */
  header: string;
  blocks: VttBlock[];
};

let keySeq = 0;
export function nextCueKey(): string {
  keySeq += 1;
  return `cue-${keySeq}`;
}

const TIME_RE = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/;

/** Parses `mm:ss.mmm` or `hh:mm:ss.mmm` to milliseconds; null if malformed. */
export function parseVttTime(input: string): number | null {
  const m = TIME_RE.exec(input.trim());
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (minutes > 59 || seconds > 59) return null;
  const millis = m[4] ? Number(m[4].padEnd(3, "0")) : 0;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Formats milliseconds as `mm:ss.mmm`, adding `hh:` only from one hour up. */
export function formatVttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const millis = total % 1000;
  const secs = Math.floor(total / 1000) % 60;
  const mins = Math.floor(total / 60_000) % 60;
  const hours = Math.floor(total / 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const base = `${p2(mins)}:${p2(secs)}.${String(millis).padStart(3, "0")}`;
  return hours > 0 ? `${p2(hours)}:${base}` : base;
}

const TIMING_RE = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/;
const NON_CUE_RE = /^(NOTE|STYLE|REGION)(?:[ \t]|$)/;

function parseBlock(lines: string[]): VttBlock {
  const raw = (): VttRaw => ({ kind: "raw", key: nextCueKey(), text: lines.join("\n") });
  if (NON_CUE_RE.test(lines[0])) return raw();
  const timingAt = lines[0].includes("-->") ? 0 : lines.length > 1 && lines[1].includes("-->") ? 1 : -1;
  if (timingAt < 0) return raw();
  const m = TIMING_RE.exec(lines[timingAt]);
  if (!m) return raw();
  const startMs = parseVttTime(m[1]);
  const endMs = parseVttTime(m[2]);
  if (startMs === null || endMs === null) return raw();
  return {
    kind: "cue",
    key: nextCueKey(),
    id: timingAt === 1 ? lines[0] : "",
    startMs,
    endMs,
    settings: (m[3] ?? "").trim(),
    text: lines.slice(timingAt + 1).join("\n"),
  };
}

/** Parses WebVTT text. Throws if the `WEBVTT` signature is missing. */
export function parseVtt(source: string): VttDocument {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:[ \t\n]|$)/.test(text)) {
    throw new Error("This file is not WebVTT: it must start with WEBVTT.");
  }
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      if (current.length > 0) groups.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);
  const [head, ...rest] = groups;
  return { header: head.join("\n"), blocks: rest.map(parseBlock) };
}

/** Collapses blank lines (which would end the cue early) out of cue text. */
function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function serializeBlock(block: VttBlock): string {
  if (block.kind === "raw") return block.text;
  const timing =
    `${formatVttTime(block.startMs)} --> ${formatVttTime(block.endMs)}` +
    (block.settings ? ` ${block.settings}` : "");
  const body = cleanText(block.text);
  // "-->" in a payload makes the file re-parse as a different cue. The editor
  // flags it per row, but the safety lives here so no caller can skip it.
  if (body.includes("-->")) throw new Error("Cue text cannot contain the sequence -->.");
  return [block.id, timing, body].filter((part, i) => i === 1 || part !== "").join("\n");
}

export function serializeVtt(doc: VttDocument): string {
  const parts = [doc.header, ...doc.blocks.map(serializeBlock)];
  return `${parts.join("\n\n")}\n`;
}

export type CueIssue = { error?: string; warning?: string };

/** One cue's validation given the previous cue's end (null for the first). */
export function cueIssue(cue: VttCue, prevEndMs: number | null): CueIssue {
  if (cue.startMs < 0 || cue.endMs < 0) return { error: "Times cannot be negative." };
  if (cue.startMs >= cue.endMs) return { error: "Start must be before the end." };
  if (cue.text.includes("-->")) return { error: "Text cannot contain the sequence -->." };
  if (cue.text.trim() === "") return { error: "Text is required." };
  if (prevEndMs !== null && cue.startMs < prevEndMs) {
    return { warning: "Overlaps the previous cue." };
  }
  return {};
}

/** Per-cue validation, index-aligned with `cues`. Errors block saving. */
export function cueIssues(cues: VttCue[]): CueIssue[] {
  return cues.map((cue, i) => cueIssue(cue, i > 0 ? cues[i - 1].endMs : null));
}
