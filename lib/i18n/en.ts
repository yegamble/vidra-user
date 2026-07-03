/**
 * Default-locale (en) string catalog. This is the single source of truth for
 * user-visible strings that have been externalized so far. It proves the app's
 * strings are *externalizable* (i18n readiness, P12) — it is NOT a full
 * translation effort. New translatable strings get a stable dotted key here;
 * `t()` (lib/i18n) reads from this catalog.
 *
 * Interpolation: `{name}` placeholders are filled from the `vars` passed to
 * `t()`. Keep values plain strings (no JSX) so a future message loader can swap
 * the whole catalog per locale.
 */
export const en = {
  // Generic primitive affordances.
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.loading": "Loading",
  "common.dismiss": "Dismiss",
  "common.retry": "Try again",

  // Report flow (ReportButton / report modal).
  "report.title": "Report this {noun}",
  "report.reasonLabel": "Reason for report",
  "report.reasonPlaceholder": "Why are you reporting this?",
  "report.submit": "Submit report",
  "report.signedInThanks": "Thanks — your report has been sent to the moderators.",
  "report.signInPrompt": "Sign in to report",
  "report.genericError": "Could not submit your report.",

  // Auth surfaces.
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
} as const;

/** A valid message key — every key present in the default catalog. */
export type MessageKey = keyof typeof en;
