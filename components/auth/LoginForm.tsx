"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthWordmark } from "@/components/auth/AuthPage";
import { useSession } from "@/components/auth/AuthProvider";
import { BlueskyLoginButton } from "@/components/auth/BlueskyLoginButton";
import { AuthOrDivider, OAuthButtons, oauthErrorMessage } from "@/components/auth/OAuthButtons";
import { LockIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";

// LoginForm drives the whole sign-in surface:
//  - email/password credentials (cookie-mode session);
//  - the two-factor challenge swap-in when login answers {mfa_required,
//    mfa_token} — a TOTP or recovery code finishes the login;
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
  initialProviders,
  initialAtprotoLogin,
}: {
  /** True when the URL carried the ?oauth=1 return_to marker. */
  oauthPending?: boolean;
  /** The ?oauth_error=<code> from a failed OAuth callback ("" when none). */
  oauthError?: string;
  /** SSR snapshot; undefined means the server could not reach the instance API. */
  initialProviders?: string[];
  /** SSR snapshot of GET /instance atproto_login (Bluesky / any PDS handle login). */
  initialAtprotoLogin?: boolean;
}) {
  const router = useRouter();
  const { status, login, completeMfaChallenge } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  // Set once login answers mfa_required: the form swaps to the code entry.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
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
  const [oauthLanding] = useState(oauthPending && !oauthError);
  const [landingDismissed, setLandingDismissed] = useState(false);
  const completingOAuth = oauthLanding && !landingDismissed && status === "restoring";
  const oauthSilentFailure = oauthLanding && !landingDismissed && status === "anon";
  const [providers, setProviders] = useState<string[]>(initialProviders ?? []);
  const [atprotoEnabled, setAtprotoEnabled] = useState(initialAtprotoLogin ?? false);

  // Clean the one-shot OAuth markers out of the URL (they must not survive a
  // reload/bookmark); the outcome already lives in state.
  useEffect(() => {
    if (oauthPending || oauthError) router.replace("/login");
  }, [oauthPending, oauthError, router]);

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
    setLandingDismissed(true); // a manual attempt supersedes the OAuth landing
    setSubmitting(true);
    try {
      const outcome = await login({ email, password });
      if (outcome.status === "mfa_required") {
        // Valid credentials, but the account needs a second factor: no
        // session exists yet — swap to the code entry.
        setMfaToken(outcome.mfaToken);
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch (err) {
      setError(
        errorMessage(err, "Something went wrong. Please try again.", {
          "401": "Invalid email or password.",
          // Server-side validation reject (e.g. malformed email) — the raw
          // backend string is "validation failed", which tells a person nothing.
          "422": "Enter a valid email address and password.",
          // W7 verification hold: valid credentials, account not yet verified.
          email_verification_required:
            "Verify your email address first — check your inbox for the verification link, then sign in again.",
        }),
      );
      setSubmitting(false);
    }
  }

  async function submitChallenge() {
    if (!mfaToken) return;
    setError(null);
    setSubmitting(true);
    try {
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

  if (completingOAuth) {
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
    <p
      role="alert"
      className="rounded-xl border border-danger-border bg-danger-surface px-3.5 py-2.5 text-sm text-danger"
    >
      {displayError}
    </p>
  ) : null;

  if (mfaToken) {
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
            // returns to a clean credentials form.
            setMfaToken(null);
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
          <AuthWordmark brandClassName="text-[30px]" />
        </h1>
        <p className="text-title2 text-fg">Sign in to Vidra</p>
      </div>

      {errorBanner}

      <Input
        id="login-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
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
