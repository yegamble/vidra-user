// Per-video last playback position for viewers with no account (localStorage).
// A signed-in viewer's resume comes from the server (GET watch progress); this is
// the same offer for everyone else. Reuses the shared resume floor/finished
// ceiling so both layers agree on what a "resume" is. Every access is guarded:
// storage can be absent or throw (private mode, blocked site data).

import { isFinished, RESUME_MIN_SECONDS } from "@/lib/resume-progress";

const PREFIX = "vidra.position.";
const INDEX_KEY = "vidra.position-index";
const MAX_ENTRIES = 200;

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The remembered position for a video, or null (none, trivial, or finished). */
export function readLastPosition(videoId: string, duration?: number | null): number | null {
  try {
    const raw = store()?.getItem(PREFIX + videoId);
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < RESUME_MIN_SECONDS) return null;
    if (isFinished(n, duration)) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

/**
 * Remember a position; a trivial or finished one clears the entry instead, so a
 * video watched to the end does not offer to resume. The key set is bounded
 * (oldest evicted) — an anonymous browser must not grow storage without limit.
 */
export function writeLastPosition(videoId: string, position: number, duration?: number | null): void {
  const s = store();
  if (!s) return;
  try {
    if (!Number.isFinite(position) || position < RESUME_MIN_SECONDS || isFinished(position, duration)) {
      s.removeItem(PREFIX + videoId);
      return;
    }
    s.setItem(PREFIX + videoId, String(Math.floor(position)));
    let index: string[] = [];
    try {
      const parsed: unknown = JSON.parse(s.getItem(INDEX_KEY) ?? "[]");
      if (Array.isArray(parsed)) index = parsed.filter((v): v is string => typeof v === "string");
    } catch {
      /* corrupt index — rebuild from here */
    }
    const next = [...index.filter((id) => id !== videoId), videoId];
    while (next.length > MAX_ENTRIES) {
      const evicted = next.shift();
      if (evicted) s.removeItem(PREFIX + evicted);
    }
    s.setItem(INDEX_KEY, JSON.stringify(next));
  } catch {
    /* storage full or disabled — non-fatal */
  }
}
