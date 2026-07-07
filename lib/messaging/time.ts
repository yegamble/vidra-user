// Pure time-formatting helpers for the Messaging v2 thread view. Dependency-free
// so they unit-test in the node environment. All formatting is 24h LOCAL time
// (the viewer's zone), matching the design-system's restrained, scannable style.

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** sameDay reports whether two ISO timestamps fall on the same LOCAL calendar day. */
export function sameDay(aIso: string, bIso: string): boolean {
  return startOfDay(new Date(aIso)) === startOfDay(new Date(bIso));
}

/**
 * separatorLabel renders a centered day/gap separator label, mirroring iMessage:
 *   today      → "Today · 14:32"
 *   yesterday  → "Yesterday · 09:15"
 *   < 7 days   → "Mon · 14:02"
 *   this year  → "3 Jul · 14:02"
 *   older      → "3 Jul 2025 · 14:02"
 */
export function separatorLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  const time = hhmm(d);
  if (dayDiff <= 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Yesterday · ${time}`;
  if (dayDiff < 7) return `${WEEKDAYS[d.getDay()]} · ${time}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${time}`;
}

/**
 * absoluteTime renders the full LOCAL timestamp for a bubble's `<time>` element,
 * hover `title`, and its screen-reader accessible name (e.g.
 * "Fri, 3 Jul 2026, 14:02"). Locale/zone come from the viewer's environment.
 */
export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
