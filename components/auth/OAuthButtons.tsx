"use client";

import { oauthBeginUrl } from "@/lib/api";

// OAuthButtons renders one "Continue with <Provider>" entry per configured
// OIDC provider (GET /instance oauth_providers). Each entry is a plain anchor:
// the begin endpoint answers a 302 to the provider, so it must be reached by a
// TOP-LEVEL navigation (never fetch). The callback lands the session as an
// httpOnly cookie and redirects back to `returnTo` — the login/signup pages
// pass their own path plus the ?oauth=1 marker so the landing is recognised
// (see the landing handling in LoginForm/SignupForm). Renders nothing when no
// provider is configured.
export function OAuthButtons({
  providers,
  returnTo,
}: {
  providers: string[];
  returnTo: string;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          or
        </span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <ul className="flex flex-col gap-2">
        {providers.map((provider) => (
          <li key={provider}>
            <a
              href={oauthBeginUrl(provider, returnTo)}
              className="flex items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {/* Key glyph: an external sign-in. */}
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              Continue with {providerDisplayName(provider)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "google" -> "Google" — provider names are configured lowercase identifiers. */
export function providerDisplayName(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Honest copy for the machine-readable ?oauth_error=<code> the OAuth callback
 * redirects back with on a user-actionable failure.
 */
export function oauthErrorMessage(code: string): string {
  switch (code) {
    case "access_denied":
      return "The sign-in was cancelled at the provider.";
    case "email_conflict":
      return "That provider login could not be linked: another account already uses its email address.";
    case "email_required":
      return "The provider did not share a verified email address, which this instance requires.";
    case "account_disabled":
      return "This account is disabled.";
    case "conflict":
      return "An account could not be created — the username or email is already taken.";
    default:
      return "Signing in with the provider failed. Please try again.";
  }
}
