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
      <AuthOrDivider />
      <ul className="flex flex-col gap-2">
        {providers.map((provider) => (
          <li key={provider}>
            <a
              href={oauthBeginUrl(provider, returnTo)}
              className="focus-ring flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-muted"
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

/**
 * The "— or —" rule that separates the primary credentials form from the
 * alternative sign-in methods. Shared so the OIDC list and the ATProto/Bluesky
 * affordance never render two competing dividers: OAuthButtons draws it above
 * its provider list, and the auth forms draw it once for the Bluesky-only case
 * (no OIDC providers configured).
 */
export function AuthOrDivider() {
  return (
    <div className="my-1 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="text-xs text-fg-muted">or</span>
      <span className="h-px flex-1 bg-border-subtle" />
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
    // ATProto identity-login callback failures (Bluesky / any PDS).
    case "atproto_identity_mismatch":
      return "Bluesky sign-in could not be verified. Try again.";
    case "atproto_upstream":
      return "Could not reach your Bluesky server. Try again shortly.";
    case "atproto_disabled":
      return "Bluesky sign-in is not enabled on this instance.";
    default:
      return "Signing in with the provider failed. Please try again.";
  }
}
