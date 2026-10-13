import type { ReportReason } from "@/lib/api/types";
import { formatDuration } from "@/lib/format";

/**
 * PeerTube's predefined abuse reasons, in its display order, with the label a
 * reporter or moderator reads. The wire values are the contract (core 0170).
 */
export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: "violentOrRepulsive", label: "Violent or repulsive" },
  { value: "hatefulOrAbusive", label: "Hateful or abusive" },
  { value: "spamOrMisleading", label: "Spam or misleading" },
  { value: "privacy", label: "Privacy" },
  { value: "rights", label: "Rights" },
  { value: "serverRules", label: "Breaks server rules" },
  { value: "thumbnails", label: "Thumbnails" },
  { value: "captions", label: "Captions" },
];

export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/**
 * parseTimestamp reads "90", "1:30" or "1:02:03" as whole seconds. Anything
 * else (empty, negative, fractional, malformed) is null — the caller treats an
 * empty field as "not set" and a non-empty null as a validation error.
 */
export function parseTimestamp(raw: string): number | null {
  const parts = raw.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((total, p) => total * 60 + Number(p), 0);
}

/** "1:30" or "1:30–2:00" for a report's range; end is open for a single moment. */
export function formatReportRange(start: number, end?: number): string {
  return end === undefined ? formatDuration(start) : `${formatDuration(start)}–${formatDuration(end)}`;
}
