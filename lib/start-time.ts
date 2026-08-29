// YouTube's duration form: an optional h, m and s component in that order,
// each at most once, at least one present ("90s", "1m30s", "1h2m3s", "2h").
// Anchored so ordering + duplicate rules fall out of the match itself.
const HMS_RE = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;

// parseStartTime reads the watch-page/embed `?t=<seconds>` start parameter out
// of a location search string. Bare whole positive seconds (`?t=90`) and
// YouTube's `?t=1m30s` duration form are honoured; anything else (absent,
// empty, zero, negative, fractional, out-of-order, non-numeric) is null.
// People paste YouTube-shaped links, so accepting both costs nothing here and
// spares every caller (watch page, embed) from a second parser.
// Pure + dependency-free so it unit-tests in the node environment.
export function parseStartTime(search: string): number | null {
  const raw = new URLSearchParams(search).get("t");
  if (raw === null) return null;
  const value = raw.trim();
  if (value === "") return null;

  let t: number;
  if (/^\d+$/.test(value)) {
    t = Number(value);
  } else {
    const m = HMS_RE.exec(value);
    // The regex also matches "", i.e. no component at all — reject that.
    if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) {
      return null;
    }
    t = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }

  if (!Number.isInteger(t) || t <= 0) return null;
  return t;
}
