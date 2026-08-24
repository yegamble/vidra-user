// Display vocabulary and formatting for the admin playback-health page
// (phase-4 delivery item 4). Pure + dependency-free so it unit-tests in the
// node environment; the rendering lives in AdminPlaybackHealthView.
//
// Every label map below is an EXHAUSTIVE Record over the contract's own closed
// vocabulary, deliberately: the backend caps a rollup hour at
// 6 sources x 4 engines x 3 formats precisely because those sets are closed, so
// a member added core-side should become a compile error here rather than a raw
// snake_case string leaking onto an operator's screen.

import type {
  QoEBucket,
  QoEDeliverySource,
  QoEEngine,
  QoEPackagingFormat,
} from "@/lib/api/types";

/** Operator-facing names for the delivery sources, in the contract's own order. */
export const DELIVERY_SOURCE_LABEL: Record<QoEDeliverySource, string> = {
  "api-proxy": "Through the API",
  presigned: "Object store (presigned)",
  cdn: "CDN",
  "ipfs-gateway": "IPFS gateway",
  "origin-live": "Live origin",
  other: "Somewhere else",
};

/** One line explaining what each source actually means for the bytes. */
export const DELIVERY_SOURCE_NOTE: Record<QoEDeliverySource, string> = {
  "api-proxy": "Bytes streamed by this server itself — the fallback that always works.",
  presigned: "The viewer fetched a signed URL straight from the object store.",
  cdn: "The viewer was served by the configured edge.",
  "ipfs-gateway": "The viewer was served by the configured IPFS gateway.",
  "origin-live": "The live plane's ephemeral segments.",
  other:
    "An origin this server does not recognise, collapsed into one bucket so an unknown host can never become a dimension of its own.",
};

/** Operator-facing names for the playback engines. */
export const ENGINE_LABEL: Record<QoEEngine, string> = {
  "hls-js": "hls.js",
  "native-hls": "Native HLS",
  progressive: "Progressive",
  shaka: "Shaka",
};

/** Operator-facing names for the packaging formats. */
export const PACKAGING_FORMAT_LABEL: Record<QoEPackagingFormat, string> = {
  "hls-ts": "HLS / TS",
  cmaf: "CMAF",
  progressive: "Progressive file",
};

/**
 * Operator-facing names for the error classes. Not a Record: the response's
 * `error_counts` is a plain string-keyed map, and the server drops keys outside
 * its own vocabulary before sending — so an unrecognised key here means this
 * client is older than the server, and humanising it beats hiding it.
 */
const ERROR_CLASS_LABEL: Record<string, string> = {
  network: "network",
  media: "media",
  manifest: "manifest",
  decrypt: "decrypt",
  timeout: "timeout",
  other: "other",
};

export function errorClassLabel(key: string): string {
  return ERROR_CLASS_LABEL[key] ?? key.replace(/_/g, " ");
}

/**
 * Whether an engine can name the variant it is playing.
 *
 * False for native HLS, permanently — the browser owns variant selection via
 * the manifest's SCORE attribute and exposes no hook for reading it. The
 * response says so per hourly bucket (`rendition_reporting_supported`); this
 * mirror exists for the source SUMMARY, which has no such flag and only lists
 * which engines contributed. Zero bitrate switches from Safari is a capability
 * gap, not flawless ABR, and the page has to be able to say which.
 */
export function reportsRenditions(engine: QoEEngine): boolean {
  return engine !== "native-hls";
}

/** True when any of the engines that contributed to a row cannot report renditions. */
export function hasUnreportableEngine(engines: readonly QoEEngine[] | undefined): boolean {
  return (engines ?? []).some((engine) => !reportsRenditions(engine));
}

/**
 * Whether one hourly bucket's engine could report variant switches. The server
 * states this per row; the engine fallback covers a server older than this
 * field, and defaults to "yes" only when there is no engine to judge — an
 * unknown engine is not a reason to accuse it of a capability gap.
 */
export function bucketReportsRenditions(
  // Partial, deliberately: the spec now declares both fields required, but the
  // fallback below exists precisely for a server that predates them, and a
  // required-field type would make that branch unreachable to its own callers.
  bucket: Partial<Pick<QoEBucket, "engine" | "rendition_reporting_supported">>,
): boolean {
  if (typeof bucket.rendition_reporting_supported === "boolean") {
    return bucket.rendition_reporting_supported;
  }
  return bucket.engine ? reportsRenditions(bucket.engine) : true;
}

/**
 * The selectable windows. The endpoint caps a request at 7 days (rollups keep
 * 90, but one response merges every row in the window in memory), and 24h is
 * BOTH the default and the phase-4 exit criterion — which is why it sends no
 * parameters at all: the criterion is the zero-argument call.
 */
export const WINDOW_OPTIONS = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
] as const;

export type WindowHours = (typeof WINDOW_OPTIONS)[number]["hours"];

export const DEFAULT_WINDOW_HOURS: WindowHours = 24;

/**
 * The `since` parameter for a window, or undefined for the default 24h — which
 * the endpoint already means by "no parameters", so the exit criterion stays a
 * bare GET.
 */
export function windowSince(hours: WindowHours, now: Date = new Date()): string | undefined {
  if (hours === DEFAULT_WINDOW_HOURS) return undefined;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Round to `digits` significant figures without ever producing float noise:
 * integers are scaled by integer powers of ten in whichever direction keeps the
 * arithmetic exact.
 */
function toSignificant(value: number, digits: number): number {
  if (value === 0) return 0;
  const shift = digits - 1 - Math.floor(Math.log10(Math.abs(value)));
  if (shift >= 0) return Math.round(value * 10 ** shift) / 10 ** shift;
  return Math.round(value / 10 ** -shift) * 10 ** -shift;
}

/**
 * Render a percentile in the precision the measurement actually has.
 *
 * The percentiles come from FIXED-BOUNDARY HISTOGRAMS (that is what makes them
 * mergeable across 24 hourly rows in the first place), and the boundaries are
 * about 15% apart with interpolation inside a bucket. Printing "1,237 ms" off a
 * number whose true value is somewhere in a ±7% band would be four digits of
 * confidence the data cannot support, so this rounds to two significant figures
 * and switches to seconds at a second — the resolution an operator can act on.
 *
 * null/undefined is "nothing of this kind was measured", which is emphatically
 * NOT zero: 0 ms of rebuffering is the number an admin reads as perfect
 * delivery. It renders as an em dash and the caller labels it.
 */
export function formatApproxMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  const rounded = toSignificant(ms, 2);
  if (rounded < 1000) return `${rounded} ms`;
  return `${(rounded / 1000).toFixed(1).replace(/\.0$/, "")} s`;
}

/**
 * A part-of-whole as a whole-number percentage, or "—" when the whole is zero
 * (0/0 is unknown, not 0%).
 */
export function formatShare(part: number | undefined, total: number | undefined): string {
  if (!total || total <= 0) return "—";
  return `${Math.round(((part ?? 0) / total) * 100)}%`;
}

/**
 * Rebuffers per playback. Counts of stalls divided by counts of starts — NOT
 * "percentage of sessions that stalled", which this data cannot answer: the
 * rollup counts events, not sessions, and one bad session can contribute many.
 */
export function formatRebufferRate(
  rebuffers: number | undefined,
  starts: number | undefined,
): string {
  if (!starts || starts <= 0) return "—";
  return ((rebuffers ?? 0) / starts).toFixed(2);
}

/** Error classes as "network 4 · timeout 1", heaviest first. Empty → "". */
export function summarizeErrorCounts(counts: Record<string, number> | undefined): string {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => n > 0);
  if (entries.length === 0) return "";
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.map(([key, n]) => `${errorClassLabel(key)} ${n}`).join(" · ");
}
