export const VAST_PLAYED_AT_STORAGE_KEY = "vidra.vast.last-played";

const validTimestamp = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** A shared same-origin timestamp, re-read for every video's ad request. */
export function canPlayVast(cooldownSeconds: number): boolean {
  const cooldownMs = cooldownSeconds * 1000;
  const now = Date.now();
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0 || !validTimestamp(now)) return true;
  try {
    const raw = localStorage.getItem(VAST_PLAYED_AT_STORAGE_KEY);
    if (raw === null || !/^\d+$/.test(raw)) return true;
    const playedAt = Number(raw);
    // Corrupt storage or a backwards clock must never lock playback out.
    if (!validTimestamp(playedAt) || playedAt > now) return true;
    return now - playedAt >= cooldownMs;
  } catch { return true; }
}

/** Call only when ad media actually fires playing, never on load or no fill. */
export function markVastPlayed(): void {
  const now = Date.now();
  if (!validTimestamp(now)) return;
  try { localStorage.setItem(VAST_PLAYED_AT_STORAGE_KEY, String(now)); }
  catch { /* Privacy settings may disable storage; ads still fail open. */ }
}
