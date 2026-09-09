"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthWordmark, authBrandName } from "@/components/auth/AuthPage";
import { useSession } from "@/components/auth/AuthProvider";
import { BlueskyLoginButton } from "@/components/auth/BlueskyLoginButton";
import { AuthOrDivider, OAuthButtons, oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { ResendVerification } from "@/components/auth/ResendVerification";
import { LockIcon } from "@/components/icons";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import { loginCredentials, looksLikeEmail } from "@/lib/login-identifier";

// LoginForm drives the whole sign-in surface:
//  - email-or-username + password credentials (cookie-mode session);
//  - the two-factor challenge swap-in when login answers {mfa_required,
//    mfa_token} — a TOTP or recovery code finishes the login — AND when a
//    PROVIDER sign-in lands here with ?mfa=required, which is the same
//    challenge with the token in an httpOnly cookie instead of in state;
//  - one "Continue with <Provider>" button per configured OIDC provider
//    (GET /instance oauth_providers), navigating top-level to the backend's
//    OAuth begin endpoint with return_to=/login?oauth=1;
//  - the OAuth landing: the callback issues the session as an httpOnly cookie
//    and redirects back here, so ?oauth=1 waits for the boot-time silent
//    refresh to settle (authed -> home) and ?oauth_error=<code> renders the
//    honest failure copy. Both markers are cleaned from the URL immediately.
export function LoginForm({
  oauthPending = false,
  oauthError = "",
  mfaPending = false,
  initialProviders,
  initialAtprotoLogin,
  instanceName,
}: {
  /** True when the URL carried the ?oauth=1 return_to marker. */
  oauthPending?: boolean;
  /** The ?oauth_error=<code> from a failed OAuth callback ("" when none). */
  oauthError?: string;
  /**
   * True when the URL carried ?mfa=required: a provider sign-in verified the
   * account and stopped short of a session because two-factor is on. The token
   * is NOT here — it is in the httpOnly `vidra_mfa_pending` cookie, deliberately,
   * so it stays out of the browser history, Referer headers and proxy logs. The
   * challenge below submits with credentials and no token.
   */
  mfaPending?: boolean;
  /** SSR snapshot; undefined means the server could not reach the instance API. */
  initialProviders?: string[];
  /** SSR snapshot of GET /instance atproto_login (Bluesky / any PDS handle login). */
  initialAtprotoLogin?: boolean;
  /**
   * SSR snapshot of GET /instance `name` — what this person is signing IN to.
   * Undefined/empty falls back to the product name (a build-time prerender has
   * no backend to ask).
   */
  instanceName?: string | null;
}) {
  const router = useRouter();
  const { status, login, completeMfaChallenge } = useSession();
  // One field for both sign-in identifiers: an email address or a username.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  // Set once login answers mfa_required: the form swaps to the code entry.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  // The same challenge, arrived at from a provider redirect. Sticky, because
  // the ?mfa=required marker is cleaned out of the URL immediately below.
  const [providerChallenge, setProviderChallenge] = useState(mfaPending);
  // Either route shows the challenge; only one of them has a token to send.
  const challenging = mfaToken !== null || providerChallenge;
  const [code, setCode] = useState("");
  // The TOTP path shows the 6-digit box grid; the recovery path swaps to a
  // single free-text field (recovery codes are hyphenated, not 6 digits). The
  // key remounts the OTP grid so switching back starts from empty boxes.
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [otpKey, setOtpKey] = useState(0);
  // Sticky OAuth-landing marker: initialised from the one-shot ?oauth=1 prop
  // so it survives the URL cleanup below. While the boot silent-refresh is
  // still deciding, the landing shows a spinner; a settled "anon" means the
  // callback did NOT hand us a session cookie — surfaced honestly (dismissed
  // once the user falls back to the password form).
  // Set to the address a refused sign-in was made with when login answers 403
  // email_verification_required. It is what turns that refusal from a dead end
  // into an action: the account is held BECAUSE it cannot sign in, so the
  // signed-in resend is unreachable to exactly the person who needs it.
  // Null when the attempt used a username — this instance knows the address,
  // and the browser does not, so there is nothing honest to offer.
  const [verificationBlocked, setVerificationBlocked] = useState<string | null>(null);
  const [oauthLanding] = useState(oauthPending && !oauthError);
  const [landingDismissed, setLandingDismissed] = useState(false);
  const completingOAuth = oauthLanding && !landingDismissed && status === "restoring";
  const oauthSilentFailure = oauthLanding && !landingDismissed && status === "anon";
  const [providers, setProviders] = useState<string[]>(initialProviders ?? []);
  const [atprotoEnabled, setAtprotoEnabled] = useState(initialAtprotoLogin ?? false);

  // Clean the one-shot OAuth markers out of the URL (they must not survive a
  // reload/bookmark); the outcome already lives in state.
  useEffect(() => {
    if (oauthPending || oauthError || mfaPending) router.replace("/login");
  }, [oauthPending, oauthError, mfaPending, router]);

  // A successful OAuth landing: the silent refresh picked up the session
  // cookie the callback set — leave the login page.
  useEffect(() => {
    if (oauthLanding && status === "authed") router.replace("/");
  }, [oauthLanding, status, router]);

  useEffect(() => {
    // Paint the server snapshot immediately, then revalidate it in place so a
    // recently changed provider list and route-mocked environments stay live.
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((instance) => {
        setProviders(instance.oauth_providers ?? []);
        setAtprotoEnabled(instance.atproto_login ?? false);
      })
      .catch(() => {
        // No instance document — the password form still works without buttons.
      });
    return () => controller.abort();
  }, [initialProviders]);

  async function submit() {
    setError(null);
    setVerificationBlocked(null);
    setLandingDismissed(true); // a manual attempt supersedes the OAuth landing
    setSubmitting(true);
    try {
      // Email-shaped input goes out as the legacy `email` field, anything else
      // as `identifier` — see lib/login-identifier: it keeps email sign-in
      // working if this deploys ahead of the backend that added `identifier`.
      const outcome = await login(loginCredentials(identifier, password));
      if (outcome.status === "mfa_required") {
        // Valid credentials, but the account needs a second factor: no
        // session exists yet — swap to the code entry.
        setMfaToken(outcome.mfaToken);
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === "email_verification_required" &&
        looksLikeEmail(identifier)
      ) {
        setVerificationBlocked(identifier.trim());
      }
      setError(
        errorMessage(err, "Something went wrong. Please try again.", {
          // Identifier-neutral: the attempt may have used a username.
          "401": "Invalid email/username or password.",
          // Server-side validation reject (too short/long identifier, missing
          // password) — the raw backend string is "validation failed", which
          // tells a person nothing.
          "422": "Enter your email or username, and your password.",
          // W7 verification hold: valid credentials, account not yet verified.
          email_verification_required:
            "Verify your email address first — check your inbox for the verification link, then sign in again.",
        }),
      );
      setSubmitting(false);
    }
  }

  async function submitChallenge() {
    if (!challenging) return;
    setError(null);
    setSubmitting(true);
    try {
      // A null token is the provider path: the backend reads the pending
      // cookie the callback set, which the request carries with credentials.
      await completeMfaChallenge(mfaToken, code.trim());
      router.push("/");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.status === 401) {
        setError(
          "That code didn't work, or this sign-in attempt has expired. Enter a fresh code, or go back and sign in again.",
        );
      } else if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts — wait a moment and try again.");
      } else {
        setError(errorMessage(err));
      }
    }
  }

  if (completingOAuth && !challenging) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label="Completing sign-in" />
      </div>
    );
  }

  const displayError =
    error ??
    (oauthSilentFailure
      ? "Could not complete the sign-in with the provider. Please try again."
      : null);
  const errorBanner = displayError ? (
    <Alert>
      {displayError}
    </Alert>
  ) : null;

  if (challenging) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submitChallenge();
        }}
        className="flex flex-col gap-4"
      >
        <div className="mb-2 flex flex-col items-center gap-2 text-center">
          <div
            aria-hidden
            className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent/12"
          >
            <LockIcon size={24} className="text-accent" />
          </div>
          <h1 className="text-title text-fg">Two-factor authentication</h1>
          <p className="text-subhead text-fg-muted">
            {recoveryMode
              ? "Enter one of your recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {errorBanner}

        {recoveryMode ? (
          <Input
            id="mfa-code"
            name="mfa-code"
            type="text"
            label="Recovery code"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="min-h-12 text-base"
          />
        ) : (
          <OtpInput
            key={otpKey}
            label="Authentication code"
            autoFocus
            onChange={setCode}
          />
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={submitting || (recoveryMode ? code.trim() === "" : code.length < 6)}
        >
          {submitting ? "Verifying…" : "Verify code"}
        </Button>

        <button
          type="button"
          onClick={() => {
            // Swap between the authenticator (6 boxes) and recovery (free text)
            // paths, clearing whatever was half-entered on the other one.
            setRecoveryMode((on) => !on);
            setCode("");
            setError(null);
            setOtpKey((k) => k + 1);
          }}
          className="focus-ring self-center rounded-sm text-subhead font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          {recoveryMode ? "Enter a code from your app instead" : "Use a recovery code instead"}
        </button>

        <button
          type="button"
          onClick={() => {
            // The mfa_token is single-purpose and short-lived; dropping it
            // returns to a clean credentials form. The provider variant drops
            // the marker instead — the cookie is the server's to expire, and it
            // dies on its own in five minutes.
            setMfaToken(null);
            setProviderChallenge(false);
            setCode("");
            setRecoveryMode(false);
            setError(null);
          }}
          className="focus-ring self-center rounded-sm text-subhead font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <h1>
          <AuthWordmark brandClassName="text-[30px]" instanceName={instanceName} />
        </h1>
        {/* The destination is the INSTANCE, not the software running it — the
            same name the tab title and the app header already show. */}
        <p className="text-title2 text-fg">Sign in to {authBrandName(instanceName)}</p>
      </div>

      {errorBanner}
      {verificationBlocked ? <ResendVerification email={verificationBlocked} /> : null}

      {/* type="text", not "email": a username is a valid value here, and the
          browser's built-in email validation would reject one. autoComplete
          "username" is the correct token for a field that accepts either — it
          is what password managers expect next to current-password. */}
      <Input
        id="login-identifier"
        name="identifier"
        type="text"
        label="Email or username"
        autoComplete="username"
        required
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        className="min-h-12 text-base"
      />

      <div className="flex flex-col gap-1.5">
        <Input
          id="login-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-12 text-base"
        />
        <Link
          href="/reset-password"
          className="focus-ring self-start rounded-sm text-footnote font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Forgot your password?
        </Link>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>

      {/* One "or" rule for the whole alternative-auth group: OAuthButtons draws
          it above the provider list; when only Bluesky is enabled we draw it
          here instead. The ATProto callback appends ?oauth=1 to a BARE return_to
          itself, so the Bluesky button passes "/login" (not "/login?oauth=1"). */}
      {providers.length === 0 && atprotoEnabled ? <AuthOrDivider /> : null}
      <OAuthButtons providers={providers} returnTo="/login?oauth=1" />
      <BlueskyLoginButton enabled={atprotoEnabled} returnTo="/login" />

      <p className="text-center text-subhead text-fg-muted">
        No account?{" "}
        <Link
          href="/signup"
          className="focus-ring rounded-sm font-semibold text-accent-text transition-opacity hover:opacity-80"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
