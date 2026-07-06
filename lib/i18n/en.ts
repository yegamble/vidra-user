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

  // Accessibility affordances.
  "a11y.skipToContent": "Skip to content",

  // App-shell states, surfaced through the shared primitives (Spinner,
  // ErrorState) so every loading/error surface in the app is externalized at
  // once. See .ralph/specs/design-system.md ("i18n coverage").
  "state.errorTitle": "Something went wrong",
  "state.errorBody": "An unexpected error occurred while showing this page.",
  "state.notFoundTitle": "Page not found",
  "state.notFoundBody": "The page you're looking for doesn't exist or may have been moved.",
  "state.notFoundHome": "Go home",

  // Report flow (ReportButton / report modal).
  "report.title": "Report this {noun}",
  "report.reasonLabel": "Reason for report",
  "report.reasonPlaceholder": "Why are you reporting this?",
  "report.submit": "Submit report",
  "report.signedInThanks": "Thanks — your report has been sent to the moderators.",
  "report.signInPrompt": "Sign in to report",
  "report.genericError": "Could not submit your report.",

  // Appearance (theme) preference — ThemeToggle.
  "theme.appearance": "Appearance",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  // Auth surfaces.
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signingIn": "Signing in…",
} as const;

/** A valid message key — every key present in the default catalog. */
export type MessageKey = keyof typeof en;
