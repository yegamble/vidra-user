// User-facing error copy: one place that turns a thrown value (almost always an
// ApiError from the fetch/XHR clients) into a friendly, ACCURATE sentence.
//
// Why centralize this? Every form/mutation surface used to do
//   err instanceof ApiError ? err.message : "Could not do the thing."
// which is mostly right — the backend's ErrorResponse envelope carries a human
// `message` per code (e.g. "you do not own this channel", "incorrect password")
// that is better than any generic copy. But that pattern has blind spots,
// because the API clients wrap *transport* failures as an ApiError too:
//   1. A network failure (status 0, code "network_error") surfaced the terse,
//      lowercase "could not reach the server" everywhere.
//   2. A 429 surfaced the backend's bare "rate limit exceeded".
//   3. A 5xx surfaced the backend's scrubbed "an unexpected error occurred".
// errorMessage() maps network + rate-limit to friendly fixed copy, never shows a
// 5xx body (falls back to the caller's contextual default instead), and
// otherwise PREFERS the envelope message — only using the domain default when
// the envelope has nothing meaningful to say (or the throw was not an ApiError).

import { ApiError } from "./client";
import type { FieldError } from "./types";

/** Shown when no HTTP response reached the client (offline, DNS, CORS, abort). */
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";
/** Shown on 429 / rate_limited. */
export const RATE_LIMITED_MESSAGE =
  "You're doing that too often. Please wait a moment and try again.";
/** Last-resort copy when the caller gives no domain default. */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

// Envelope messages we treat as "not worth showing" — the raw client/back-end
// placeholders — so the caller's domain fallback is used instead.
function isPlaceholderMessage(message: string): boolean {
  const m = message.trim().toLowerCase();
  return (
    m === "" ||
    m.startsWith("request failed with status") || // client.ts default (unparseable body)
    m === "an unexpected error occurred" || // backend 5xx scrub (defensive)
    m === "could not reach the server" || // client.ts network wrap
    m === "http_error"
  );
}

function overrideFor(
  err: ApiError,
  overrides: Record<string, string> | undefined,
): string | undefined {
  if (!overrides) return undefined;
  // Code first (e.g. "conflict", "quota_exceeded"), then status (e.g. "403").
  if (err.code && Object.prototype.hasOwnProperty.call(overrides, err.code)) {
    return overrides[err.code];
  }
  const byStatus = String(err.status);
  if (Object.prototype.hasOwnProperty.call(overrides, byStatus)) {
    return overrides[byStatus];
  }
  return undefined;
}

/**
 * errorMessage turns any thrown value into friendly, accurate copy.
 *
 * @param err        the caught value (typically an ApiError)
 * @param fallback   domain-specific default (e.g. "Could not post your comment.")
 *                   used when the error carries no meaningful, user-safe message —
 *                   including any 5xx, whose body is never shown
 * @param overrides  per-code or per-status copy that wins over the built-in map,
 *                   for surfaces where a status means something specific (e.g.
 *                   a 409 conflict on signup → "That username or email is taken.")
 */
export function errorMessage(
  err: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE,
  overrides?: Record<string, string>,
): string {
  if (err instanceof ApiError) {
    // Caller-supplied, context-specific copy wins first.
    const override = overrideFor(err, overrides);
    if (override !== undefined) return override;

    // Transport failure: no HTTP response reached us.
    if (err.status === 0 || err.code === "network_error") return NETWORK_ERROR_MESSAGE;

    // Rate limiting.
    if (err.status === 429 || err.code === "rate_limited") return RATE_LIMITED_MESSAGE;

    // Server-side problems: the backend scrubs its own 5xx messages and never
    // leaks internal detail, so we never echo a 5xx body — the caller's
    // contextual default ("Could not save the channel.") is friendlier and more
    // useful than a generic "server error".
    if (err.status >= 500) return fallback;

    // Otherwise prefer the backend's human, field-safe envelope message
    // (accurate per-code copy: 401/403/404/409/413/415/422 all carry good text).
    if (!isPlaceholderMessage(err.message)) return err.message;
  }
  return fallback;
}

/**
 * fieldErrors extracts a { field: message } map from a 422 ApiError so a form
 * can render each problem inline against its input. Returns null when the error
 * carries no field-level detail (the caller then shows a form-level message).
 */
export function fieldErrors(err: unknown): Record<string, string> | null {
  if (err instanceof ApiError && err.fields && err.fields.length > 0) {
    const map: Record<string, string> = {};
    for (const f of err.fields as FieldError[]) {
      if (f.field) map[f.field] = f.message;
    }
    return Object.keys(map).length > 0 ? map : null;
  }
  return null;
}
