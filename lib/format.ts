// Small pure formatting helpers for UI display. Pure + dependency-free so they
// unit-test in the node environment.
//
// Locale: the four locale-sensitive helpers (formatCount, relativeTime,
// formatDateTime, formatMonthYear) take an optional `locale`. English keeps its
// hand-built output byte-for-byte (e2e selects by it: "5m ago", "1.2K"); any
// other locale goes through Intl. Components should not pass a locale by hand:
// `useFormat()` (client) / `getI18n().format` (server) return `createFormat(
// activeLocale)`, so the formatters follow the same per-request locale as t().

const isEnglish = (locale: string | undefined) => locale === undefined || /^en(-|$)/i.test(locale);

const intlCache = new Map<string, unknown>();
/** One Intl instance per (kind, locale, options): construction is the slow part. */
function cached<T>(kind: string, locale: string, options: object, make: () => T): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`;
  let value = intlCache.get(key) as T | undefined;
  if (value === undefined) intlCache.set(key, (value = make()));
  return value;
}

/** formatCount renders a view/follower count compactly: 942, 1.2K, 3.4M, 1.0B (en); "1,2 k" in fr. */
export function formatCount(n: number, locale?: string): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (!isEnglish(locale)) {
    const opts = { notation: "compact", maximumFractionDigits: 1 } as const;
    return cached("count", locale!, opts, () => new Intl.NumberFormat(locale, opts)).format(Math.floor(n));
  }
  if (n < 1000) return String(Math.floor(n));
  const units = [
    { v: 1_000_000_000, s: "B" },
    { v: 1_000_000, s: "M" },
    { v: 1_000, s: "K" },
  ];
  for (const { v, s } of units) {
    if (n >= v) {
      const scaled = n / v;
      // One decimal, but drop a trailing .0 (1.0K -> 1K).
      const text = scaled >= 100 ? String(Math.floor(scaled)) : scaled.toFixed(1).replace(/\.0$/, "");
      return `${text}${s}`;
    }
  }
  return String(Math.floor(n));
}

/**
 * pluralize returns `singular` when `count` is exactly 1 (English one-vs-many),
 * otherwise `plural` (defaults to `${singular}s`). Pair it with `formatCount`
 * for the label: `${formatCount(n)} ${pluralize(n, "follower")}` → "1 follower",
 * "0 followers", "1.2K followers". Pass the RAW count (not the formatted string)
 * so the abbreviation never fools the singular check.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/** formatBytes renders a byte count compactly: 512 B, 1.4 KB, 24.0 MB, 1.2 GB (SI, 1024-step). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.floor(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** relativeTime renders an ISO timestamp as a coarse "x ago" relative to now. */
export function relativeTime(iso: string, now: Date = new Date(), locale?: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.floor((now.getTime() - then) / 1000);
  if (!isEnglish(locale)) return localizedRelative(secs, locale!);
  if (secs < 0) return "just now";
  const steps: Array<{ limit: number; div: number; unit: string }> = [
    { limit: 60, div: 1, unit: "s" },
    { limit: 3600, div: 60, unit: "m" },
    { limit: 86400, div: 3600, unit: "h" },
    { limit: 604800, div: 86400, unit: "d" },
    { limit: 2629800, div: 604800, unit: "w" },
    { limit: 31557600, div: 2629800, unit: "mo" },
  ];
  for (const { limit, div, unit } of steps) {
    if (secs < limit) {
      const value = Math.floor(secs / div);
      if (unit === "s" && value < 5) return "just now";
      return `${value}${unit} ago`;
    }
  }
  return `${Math.floor(secs / 31557600)}y ago`;
}

const REL_STEPS: Array<{ limit: number; div: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { limit: 60, div: 1, unit: "second" },
  { limit: 3600, div: 60, unit: "minute" },
  { limit: 86400, div: 3600, unit: "hour" },
  { limit: 604800, div: 86400, unit: "day" },
  { limit: 2629800, div: 604800, unit: "week" },
  { limit: 31557600, div: 2629800, unit: "month" },
];

/** The same buckets as the English path, worded by Intl ("il y a 5 min", "maintenant"). */
function localizedRelative(secs: number, locale: string): string {
  const opts = { numeric: "auto", style: "short" } as const;
  const rtf = cached("rel", locale, opts, () => new Intl.RelativeTimeFormat(locale, opts));
  if (secs < 5) return rtf.format(0, "second");
  for (const { limit, div, unit } of REL_STEPS) {
    if (secs < limit) return rtf.format(-Math.floor(secs / div), unit);
  }
  return rtf.format(-Math.floor(secs / 31557600), "year");
}

/** formatUptime renders a second count as a compact "1d 2h 3m" string. */
export function formatUptime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/**
 * formatDateTime renders an ISO timestamp as a short absolute date + time in
 * the viewer's locale/zone (e.g. "Jul 10, 2026, 2:30 PM"). Used where an exact
 * future moment matters (scheduled publish), unlike relativeTime's "x ago".
 */
export function formatDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts = { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
  return cached("dt", locale ?? "", opts, () => new Intl.DateTimeFormat(locale, opts)).format(d);
}

/**
 * formatMonthYear renders an ISO timestamp as a "Month YYYY" label in the
 * viewer's locale (e.g. "July 2026") — the "Joined …" affordance on a channel's
 * About panel, where the day-level precision of formatDateTime is unwanted.
 */
export function formatMonthYear(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts = { year: "numeric", month: "long" } as const;
  return cached("my", locale ?? "", opts, () => new Intl.DateTimeFormat(locale, opts)).format(d);
}

/** The four locale-sensitive formatters bound to one locale (see the header note). */
export function createFormat(locale: string) {
  return {
    locale,
    formatCount: (n: number) => formatCount(n, locale),
    relativeTime: (iso: string, now?: Date) => relativeTime(iso, now, locale),
    formatDateTime: (iso: string) => formatDateTime(iso, locale),
    formatMonthYear: (iso: string) => formatMonthYear(iso, locale),
  };
}
export type Format = ReturnType<typeof createFormat>;

/** formatDuration renders whole seconds as m:ss, or h:mm:ss past an hour. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const ss = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(mins).padStart(2, "0")}:${ss}`;
  return `${mins}:${ss}`;
}

/** formatVersion renders a build tag for display: "v0.3.5" -> "0.3.5". */
export function formatVersion(version: string): string {
  return version.replace(/^v/, "");
}
