// parseStartTime reads the watch-page/embed `?t=<seconds>` start parameter out
// of a location search string. Only whole positive seconds are honoured;
// anything else (absent, empty, zero, negative, fractional, non-numeric) is
// null. Pure + dependency-free so it unit-tests in the node environment.
export function parseStartTime(search: string): number | null {
  const raw = new URLSearchParams(search).get("t");
  if (raw === null || raw.trim() === "") return null;
  const t = Number(raw);
  if (!Number.isInteger(t) || t <= 0) return null;
  return t;
}
